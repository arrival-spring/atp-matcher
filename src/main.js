if (process.env.NO_DEBUG === 'true') {
    console.debug = () => {};
}

import axios from 'axios';
import './axios_config.js';
import fs from 'fs';
import path from 'path';
import slugify from 'slugify';
import { getRuns, loadAllAtpData } from './atp_data.js';
import { streamOsmData } from './osm_stream.js';
import { processSpiderResults } from './result_processor.js';
import { generateWebpage } from './web_generator.js';
import { reportThresholdViolations } from './github_utils.js';

const CONFIG_FILE = 'config.json';
const SPIDERS_AUTO_FILE = 'spiders_auto.json';
const SPIDERS_PREVIEW_FILE = 'spiders_preview.json';

async function run() {
    if (!fs.existsSync(CONFIG_FILE)) {
        console.error('Config file not found.');
        process.exit(1);
    }
    if (!fs.existsSync(SPIDERS_AUTO_FILE)) {
        console.error('Spiders auto file not found.');
        process.exit(1);
    }
    if (!fs.existsSync(SPIDERS_PREVIEW_FILE)) {
        console.error('Spiders preview file not found.');
        process.exit(1);
    }

    let config, spidersAuto, spidersPreview;
    try {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        if (process.env.MOCK === 'true') {
            spidersAuto = [];
            spidersPreview = JSON.parse(fs.readFileSync('mock_data/mock_spiders.json', 'utf8'));
        } else {
            spidersAuto = JSON.parse(fs.readFileSync(SPIDERS_AUTO_FILE, 'utf8'));
            spidersPreview = JSON.parse(fs.readFileSync(SPIDERS_PREVIEW_FILE, 'utf8'));
        }
    } catch (error) {
        console.error(`Error parsing configuration files: ${error.message}`);
        process.exit(1);
    }

    let runs;
    try {
        runs = await getRuns();
        console.log(`Using runs: ${runs.map(r => r.run_id).join(', ')}`);
    } catch (error) {
        console.error(`Error fetching ATP runs: ${error.message}`);
        process.exit(1);
    }

    const atpDate = runs[runs.length - 1].start_time;

    let osmDate;
    if (process.env.MOCK === 'true') {
        osmDate = '2025-01-04T12:00:00Z';
    } else {
        try {
            const head = await axios.head(config.osmExtractUrl);
            osmDate = head.headers['last-modified'] ? new Date(head.headers['last-modified']).toISOString() : null;
        } catch (e) {
            console.warn(`Failed to get OSM date from ${config.osmExtractUrl}, using current time: ${e.message}`);
            osmDate = new Date().toISOString();
        }
    }

    const allSpiders = [...spidersAuto, ...spidersPreview];
    let spidersData, atpLookup, wikidataToSpiders;
    try {
        const atpData = await loadAllAtpData(allSpiders, runs);
        spidersData = atpData.spidersData;
        atpLookup = atpData.atpLookup;
        wikidataToSpiders = atpData.wikidataToSpiders;
    } catch (error) {
        console.error(`Error loading ATP data: ${error.message}`);
        process.exit(1);
    }

    const allMatches = new Map();
    const allUnmatched = new Map();
    for (const spiderName of spidersData.keys()) {
        allMatches.set(spiderName, new Map());
    }

    try {
        await streamOsmData(
            config.osmExtractUrl,
            allSpiders,
            atpLookup,
            wikidataToSpiders,
            allMatches,
            allUnmatched
        );
    } catch (error) {
        console.error(`Error streaming OSM data: ${error.message}`);
        process.exit(1);
    }

    const safeEditsAuto = {};
    const safeEditsPreview = {};
    const autoResults = [];
    const previewResults = [];

    const autoNames = new Set(spidersAuto.map(s => s.name));

    for (const [spiderName, data] of spidersData) {
        const isAuto = autoNames.has(spiderName);
        const safeEdits = isAuto ? safeEditsAuto : safeEditsPreview;
        const targetResults = isAuto ? autoResults : previewResults;
        try {
            if (data.loadStatus === 'missing' || data.loadStatus === 'empty') {
                targetResults.push({
                    name: spiderName,
                    importableTags: [],
                    results: [],
                    isBrandSpider: false,
                    lineage: null,
                    loadStatus: data.loadStatus,
                    stabilityColor: 'gray',
                });
                continue;
            }

            const { results, unmapped, usedTags, thresholdViolations } = await processSpiderResults(
                data,
                allMatches.get(spiderName),
                runs,
                safeEdits,
                isAuto
            );

            if (thresholdViolations && thresholdViolations.length > 0) {
                await reportThresholdViolations(spiderName, thresholdViolations, isAuto);
            }

            if (results) {
                const brands = data.brands || [];
                const countries = data.countries || [];

                // For unmapped items in results (disallowedSourceUri, notABrandSpider),
                // we need to make sure they have allAtpTags for the brand filters to work.
                const unmappedResults = results
                    .filter(r => r.status === 'disallowedSourceUri' || r.status === 'notABrandSpider')
                    .map(r => {
                        const feature = data.latestRun.features.find(f => f.properties.ref === r.ref);
                        const filteredAtpTags = {};
                        if (feature) {
                            for (const [k, v] of Object.entries(feature.properties)) {
                                if (!k.startsWith('@') && k !== 'nsi_id') {
                                    filteredAtpTags[k] = v;
                                }
                            }
                        }
                        return { ...r, allAtpTags: filteredAtpTags };
                    });

                const isMapped = r =>
                    r.matchCount >= 1 && r.status !== 'disallowedSourceUri' && r.status !== 'notABrandSpider';
                const mappedResults = results.filter(isMapped);
                const mappedCount = mappedResults.length;
                const issuesCount = mappedResults.filter(r => r.status !== 'matching').length;

                const unmatchedMap = allUnmatched.get(spiderName);
                const unmatched = unmatchedMap ? Array.from(unmatchedMap.values()) : [];

                // Identify unique brand/Wikidata pairs for unmapped and unmatched
                const unmappedFilters = [];
                const unmatchedFilters = [];

                const getBrandWikidataPairs = items => {
                    const pairs = new Map();
                    items.forEach(item => {
                        const props = item.allAtpTags || item.tags;
                        if (!props || Array.isArray(props)) {
                            console.warn(`Item missing properties or has array tags: ${item.ref || item.id}`);
                            return;
                        }
                        const brand = props.brand || null;
                        const wikidata = props['brand:wikidata'] || null;
                        const key = `${brand}|${wikidata}`;
                        if (!pairs.has(key)) {
                            pairs.set(key, { brand, wikidata, count: 0 });
                        }
                        pairs.get(key).count++;
                    });

                    const pairsArray = Array.from(pairs.values());

                    // Identify wikidata -> brand mapping for sorting Wikidata-only items after their brand equivalents
                    const wikidataToBrand = new Map();
                    pairsArray.forEach(p => {
                        if (p.brand && p.wikidata && !wikidataToBrand.has(p.wikidata)) {
                            wikidataToBrand.set(p.wikidata, p.brand);
                        }
                    });

                    return pairsArray.sort((a, b) => {
                        // "No brand" (both null) always last
                        if (!a.brand && !a.wikidata) return 1;
                        if (!b.brand && !b.wikidata) return -1;

                        const getSortKey = p => {
                            if (p.brand) return p.brand.toLowerCase();
                            if (p.wikidata && wikidataToBrand.has(p.wikidata))
                                return wikidataToBrand.get(p.wikidata).toLowerCase();
                            return 'zzzzzzzzzz'; // After all brands
                        };

                        const sortKeyA = getSortKey(a);
                        const sortKeyB = getSortKey(b);

                        if (sortKeyA !== sortKeyB) {
                            return sortKeyA.localeCompare(sortKeyB);
                        }

                        // If same sort key, brands come before Wikidata-only equivalents
                        if (a.brand && !b.brand) return -1;
                        if (!a.brand && b.brand) return 1;

                        // Otherwise sort by wikidata
                        return (a.wikidata || '').localeCompare(b.wikidata || '');
                    });
                };

                const getFilterLabel = pair => {
                    if (!pair.brand && !pair.wikidata) return 'No brand';
                    if (pair.brand && pair.wikidata) return `${pair.brand} (${pair.wikidata})`;
                    return pair.brand || pair.wikidata;
                };

                // For unmapped, we need features that are actually unmapped (including disallowed/not brand)
                const unmappedItemsForFilter = [...unmapped, ...unmappedResults];

                getBrandWikidataPairs(unmappedItemsForFilter).forEach(pair => {
                    const isNoBrand = !pair.brand && !pair.wikidata;
                    unmappedFilters.push({
                        label: getFilterLabel(pair),
                        brand: isNoBrand ? '__none__' : pair.brand,
                        wikidata: isNoBrand ? '__none__' : pair.wikidata,
                        count: pair.count,
                    });
                });

                getBrandWikidataPairs(unmatched).forEach(pair => {
                    const isNoBrand = !pair.brand && !pair.wikidata;
                    unmatchedFilters.push({
                        label: getFilterLabel(pair),
                        brand: isNoBrand ? '__none__' : pair.brand,
                        wikidata: isNoBrand ? '__none__' : pair.wikidata,
                        count: pair.count,
                    });
                });

                // Write separate JSON and GeoJSON files
                const outputDir = 'output';
                const subDir = isAuto ? 'auto' : 'preview';
                const spiderDir = path.join(outputDir, subDir, spiderName);
                if (!fs.existsSync(spiderDir)) {
                    fs.mkdirSync(spiderDir, { recursive: true });
                }

                fs.writeFileSync(path.join(spiderDir, `${spiderName}_unmapped.json`), JSON.stringify(unmapped));
                fs.writeFileSync(path.join(spiderDir, `${spiderName}_unmatched.json`), JSON.stringify(unmatched));

                // Generate unmapped GeoJSON for JOSM (including disallowedSourceUri and notABrandSpider)
                const unmappedRefs = new Set(unmappedItemsForFilter.map(r => r.ref));

                const unmappedGeoJson = {
                    type: 'FeatureCollection',
                    features: data.latestRun.features.filter(f => unmappedRefs.has(f.properties.ref)),
                };
                fs.writeFileSync(
                    path.join(spiderDir, `${spiderName}_unmapped.geojson`),
                    JSON.stringify(unmappedGeoJson)
                );

                // Generate filtered GeoJSONs for unmapped
                unmappedFilters.forEach(filter => {
                    if (unmappedFilters.length <= 1) return; // Don't bother if there's only one option (likely All or No Brand)

                    const filteredFeatures = unmappedGeoJson.features.filter(f => {
                        const b = f.properties.brand || null;
                        const w = f.properties['brand:wikidata'] || null;
                        return b === filter.brand && w === filter.wikidata;
                    });

                    const brandSlug = filter.brand
                        ? slugify(filter.brand, { lower: true, remove: /[*+~.()'"!:@]/g })
                        : 'no-brand';
                    const wikidataPart = filter.wikidata ? `_${filter.wikidata}` : '';
                    const filename = `${spiderName}_unmapped_${brandSlug}${wikidataPart}.geojson`;
                    filter.geojson = filename;

                    fs.writeFileSync(
                        path.join(spiderDir, filename),
                        JSON.stringify({
                            type: 'FeatureCollection',
                            features: filteredFeatures,
                        })
                    );
                });

                targetResults.push({
                    name: spiderName,
                    importableTags: usedTags,
                    results: results.map(r => {
                        if (r.status === 'disallowedSourceUri' || r.status === 'notABrandSpider') {
                            return unmappedResults.find(ur => ur.ref === r.ref) || r;
                        }
                        if (r.matchCount > 1) {
                            return r;
                        }
                        return { ...r, allAtpTags: undefined };
                    }),
                    isBrandSpider: data.isBrandSpider,
                    lineage: data.lineage,
                    isStale: data.isStale,
                    staleDate: data.staleDate,
                    stabilityColor: data.stabilityColor,
                    stabilityScore: data.stabilityScore,
                    loadStatus: data.loadStatus,
                    showUnmatched: data.config.showUnmatched || false,
                    unmappedCount: unmapped.length,
                    unmatchedCount: unmatched.length,
                    unmappedFilters,
                    unmatchedFilters,
                    brands,
                    countries,
                    // Totals for index page
                    totalCount: results.length + unmapped.length,
                    mappedCount,
                    issuesCount,
                });
            }
        } catch (error) {
            console.error(`Error processing results for spider ${spiderName}: ${error.message}`);
            // Continue with other spiders
        }
    }

    try {
        await generateWebpage(autoResults, previewResults, atpDate, osmDate);

        // Generate global index for landing page search
        const globalIndex = [
            ...autoResults.map(s => ({ name: s.name, brands: s.brands, tier: 'auto' })),
            ...previewResults.map(s => ({ name: s.name, brands: s.brands, tier: 'preview' })),
        ];
        fs.writeFileSync(path.join('output', 'global_index.json'), JSON.stringify(globalIndex));
    } catch (error) {
        console.error(`Error generating webpage: ${error.message}`);
    }

    // Save safe edits
    const saveSafeEdits = (safeEdits, subDir) => {
        try {
            const safeEditsDir = path.join('safe-edits', subDir);
            if (!fs.existsSync('safe-edits')) fs.mkdirSync('safe-edits');
            if (fs.existsSync(safeEditsDir)) {
                fs.rmSync(safeEditsDir, { recursive: true, force: true });
            }
            fs.mkdirSync(safeEditsDir, { recursive: true });

            for (const [spiderName, files] of Object.entries(safeEdits)) {
                const spiderDir = path.join(safeEditsDir, spiderName);
                fs.mkdirSync(spiderDir, { recursive: true });
                for (const [fileKey, content] of Object.entries(files)) {
                    fs.writeFileSync(path.join(spiderDir, `${fileKey}.json`), JSON.stringify(content, null, 2));
                }
            }
        } catch (error) {
            console.error(`Error saving safe edits for ${subDir}: ${error.message}`);
        }
    };

    saveSafeEdits(safeEditsAuto, 'auto');
    saveSafeEdits(safeEditsPreview, 'preview');
}

run().catch(err => {
    console.error(`Unhandled error in run(): ${err.message}`);
    process.exit(1);
});
