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

const CONFIG_FILE = 'config.json';
const SPIDERS_FILE = 'spiders.json';

async function run() {
    if (!fs.existsSync(CONFIG_FILE)) {
        console.error('Config file not found.');
        process.exit(1);
    }
    if (!fs.existsSync(SPIDERS_FILE)) {
        console.error('Spiders file not found.');
        process.exit(1);
    }

    let config, spiders;
    try {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        spiders = JSON.parse(fs.readFileSync(SPIDERS_FILE, 'utf8'));
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
    try {
        const head = await axios.head(config.osmExtractUrl);
        osmDate = head.headers['last-modified'] ? new Date(head.headers['last-modified']).toISOString() : null;
    } catch (e) {
        console.warn(`Failed to get OSM date from ${config.osmExtractUrl}, using current time: ${e.message}`);
        osmDate = new Date().toISOString();
    }

    let spidersData, atpLookup, wikidataToSpiders;
    try {
        const atpData = await loadAllAtpData(spiders, runs);
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
        await streamOsmData(config.osmExtractUrl, spiders, atpLookup, wikidataToSpiders, allMatches, allUnmatched);
    } catch (error) {
        console.error(`Error streaming OSM data: ${error.message}`);
        process.exit(1);
    }

    const safeEdits = {};
    const allSpiderResults = [];

    for (const [spiderName, data] of spidersData) {
        try {
            if (data.loadStatus === 'missing' || data.loadStatus === 'empty') {
                allSpiderResults.push({
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

            const { results, unmapped, usedTags } = await processSpiderResults(
                data,
                allMatches.get(spiderName),
                runs,
                safeEdits
            );

            if (results) {
                // For unmapped items in results (disallowed source uri, not a brand spider),
                // we need to make sure they have allAtpTags for the brand filters to work.
                const unmappedResults = results
                    .filter(r => r.status === 'disallowed source uri' || r.status === 'not a brand spider')
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
                    r.matchCount >= 1 && r.status !== 'disallowed source uri' && r.status !== 'not a brand spider';
                const mappedResults = results.filter(isMapped);
                const mappedCount = mappedResults.length;
                const issuesCount = mappedResults.filter(r => r.status !== 'matching').length;
                const automaticUpdatesCount = mappedResults.filter(
                    r => r.status === 'update OSM' || r.status === 'Add to OSM'
                ).length;

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
                    return Array.from(pairs.values()).sort((a, b) => b.count - a.count);
                };

                const getFilterLabel = pair => {
                    if (!pair.brand && !pair.wikidata) return 'No Brand';
                    if (pair.brand && pair.wikidata) return `${pair.brand} (${pair.wikidata})`;
                    return pair.brand || pair.wikidata;
                };

                // For unmapped, we need features that are actually unmapped (including disallowed/not brand)
                const unmappedItemsForFilter = [...unmapped, ...unmappedResults];

                getBrandWikidataPairs(unmappedItemsForFilter).forEach(pair => {
                    unmappedFilters.push({
                        label: getFilterLabel(pair),
                        brand: pair.brand,
                        wikidata: pair.wikidata,
                        count: pair.count,
                    });
                });

                getBrandWikidataPairs(unmatched).forEach(pair => {
                    unmatchedFilters.push({
                        label: getFilterLabel(pair),
                        brand: pair.brand,
                        wikidata: pair.wikidata,
                        count: pair.count,
                    });
                });

                // Write separate JSON and GeoJSON files
                const outputDir = 'output';
                const spiderDir = path.join(outputDir, spiderName);
                if (!fs.existsSync(spiderDir)) {
                    fs.mkdirSync(spiderDir, { recursive: true });
                }

                fs.writeFileSync(path.join(spiderDir, `${spiderName}_unmapped.json`), JSON.stringify(unmapped));
                fs.writeFileSync(path.join(spiderDir, `${spiderName}_unmatched.json`), JSON.stringify(unmatched));

                // Generate unmapped GeoJSON for JOSM (including disallowed source uri and not a brand spider)
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

                    fs.writeFileSync(path.join(spiderDir, filename), JSON.stringify({
                        type: 'FeatureCollection',
                        features: filteredFeatures
                    }));
                });

                allSpiderResults.push({
                    name: spiderName,
                    importableTags: usedTags,
                    results: results.map(r => {
                        if (r.status === 'disallowed source uri' || r.status === 'not a brand spider') {
                            return unmappedResults.find(ur => ur.ref === r.ref) || r;
                        }
                        return { ...r, allAtpTags: undefined };
                    }),
                    isBrandSpider: data.isBrandSpider,
                    lineage: data.lineage,
                    isStale: data.isStale,
                    staleDate: data.staleDate,
                    stabilityColor: data.stabilityColor,
                    loadStatus: data.loadStatus,
                    showUnmatched: data.config.showUnmatched || false,
                    unmappedCount: unmapped.length,
                    unmatchedCount: unmatched.length,
                    unmappedFilters,
                    unmatchedFilters,
                    // Totals for index page
                    totalCount: results.length + unmapped.length,
                    mappedCount,
                    issuesCount,
                    automaticUpdatesCount,
                });
            }
        } catch (error) {
            console.error(`Error processing results for spider ${spiderName}: ${error.message}`);
            // Continue with other spiders
        }
    }

    try {
        generateWebpage(allSpiderResults, atpDate, osmDate);
    } catch (error) {
        console.error(`Error generating webpage: ${error.message}`);
    }

    // Save safe edits
    try {
        const safeEditsDir = 'safe-edits';
        if (fs.existsSync(safeEditsDir)) {
            fs.rmSync(safeEditsDir, { recursive: true, force: true });
        }
        fs.mkdirSync(safeEditsDir);

        for (const [spiderName, files] of Object.entries(safeEdits)) {
            const spiderDir = path.join(safeEditsDir, spiderName);
            fs.mkdirSync(spiderDir, { recursive: true });
            for (const [fileKey, content] of Object.entries(files)) {
                fs.writeFileSync(path.join(spiderDir, `${fileKey}.json`), JSON.stringify(content, null, 2));
            }
        }
    } catch (error) {
        console.error(`Error saving safe edits: ${error.message}`);
    }
}

run().catch(err => {
    console.error(`Unhandled error in run(): ${err.message}`);
    process.exit(1);
});
