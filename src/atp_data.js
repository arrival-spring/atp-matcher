import axios from 'axios';
import fs from 'fs';
import { matchesCategories, calculateStability } from './shared_utils.js';
import { getNsiIdExists, getNsiItem } from './nsi_utils.js';
import { normaliseWebsite } from './tag_comparisons.js';

const HISTORY_URL = 'https://data.alltheplaces.xyz/runs/history.json';
const ATP_BASE_URL = 'https://alltheplaces-data.openaddresses.io/runs';

/**
 * Fetches the recent ATP run history.
 * In mock mode, it returns the last four runs from mock_data/runs.json.
 *
 * @returns {Promise<Object[]>} A promise resolving to an array of the last four run objects.
 */
export async function getRuns() {
    if (process.env.MOCK === 'true') {
        return JSON.parse(fs.readFileSync('mock_data/runs.json', 'utf8')).slice(-4);
    }
    console.log('Fetching ATP run history...');
    try {
        const response = await axios.get(HISTORY_URL);
        // history.json is an array of run objects, oldest first.
        // We want the last four elements.
        return response.data.slice(-4);
    } catch (error) {
        throw new Error(`Failed to fetch ATP run history: ${error.message}`, { cause: error });
    }
}

/**
 * Downloads and processes ATP GeoJSON data for all spiders across the specified runs.
 * Identifies duplicate refs and websites and builds a lookup map for automated matching.
 *
 * @param {Object} spiders - The spider configuration object.
 * @param {Object[]} runs - The ATP run objects to load data from.
 * @returns {Promise<Object>} A promise resolving to an object containing spidersData,
 *                            atpLookup, and wikidataToSpiders maps.
 */
export async function loadAllAtpData(spiders, runs) {
    const runIds = runs.map(r => r.run_id);
    const spidersData = new Map();
    const atpLookup = new Map();
    const wikidataToSpiders = new Map();

    for (const [spiderName, spiderConfig] of Object.entries(spiders)) {
        console.log(`Loading ATP data for spider: ${spiderName}`);
        const spiderRuns = [];
        const runStatuses = []; // 'ok', '404', 'empty'
        const featureCounts = [];

        for (const runId of runIds) {
            const url = `${ATP_BASE_URL}/${runId}/output/${spiderName}.geojson`;
            try {
                let data;
                if (process.env.MOCK === 'true') {
                    const mockFile = `mock_data/runs/${runId.substring(0, 10)}/output/${spiderName}.geojson`;
                    if (fs.existsSync(mockFile)) {
                        data = JSON.parse(fs.readFileSync(mockFile, 'utf8'));
                    } else {
                        throw { response: { status: 404 } };
                    }
                } else {
                    const response = await axios.get(url);
                    data = response.data;
                }
                const count = data.features ? data.features.length : 0;
                spiderRuns.push(data);
                featureCounts.push(count);
                if (count === 0) {
                    runStatuses.push('empty');
                } else {
                    runStatuses.push('ok');
                }
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    spiderRuns.push(null);
                    runStatuses.push('404');
                    featureCounts.push(null);
                } else {
                    console.error(`Error downloading ${url}: ${error.message}`);
                    spiderRuns.push(null);
                    runStatuses.push('error');
                    featureCounts.push(null);
                }
            }
        }

        // Find effective latest run (most recent non-empty, non-404)
        let effectiveLatestIndex = -1;
        for (let i = 3; i >= 0; i--) {
            if (runStatuses[i] === 'ok') {
                effectiveLatestIndex = i;
                break;
            }
        }

        if (effectiveLatestIndex === -1) {
            spidersData.set(spiderName, {
                latestRun: null,
                spiderMaps: spiderRuns.map(() => new Map()),
                config: { name: spiderName, ...spiderConfig },
                loadStatus: 'empty',
                featureCounts,
                runStatuses,
            });
            continue;
        }

        const latestRun = spiderRuns[effectiveLatestIndex];
        const isStale = effectiveLatestIndex < 3;
        const lineage = latestRun?.dataset_attributes?.['spider:lineage'];
        const isBrandSpider = lineage === 'S_ATP_BRANDS';

        if (latestRun && latestRun.features) {
            latestRun.features = latestRun.features.filter(f => {
                if ('end_date' in f.properties) return false;
                if (!matchesCategories(f.properties, spiderConfig.categories)) return false;
                return true;
            });
        }

        const spiderMaps = spiderRuns.map(run => {
            const map = new Map();
            if (run && run.features) {
                run.features.forEach(f => {
                    const val = f.properties.ref;
                    if (val) {
                        map.set(val, f.properties);
                    }
                });
            }
            return map;
        });

        // Calculate stability dot colour and score
        const { stabilityColour, stabilityValue } = calculateStability(featureCounts, isBrandSpider);

        const brandsSet = new Set();
        const countriesSet = new Set();
        if (latestRun && latestRun.features) {
            latestRun.features.forEach(f => {
                const props = f.properties;
                const b = props.brand;
                if (b) brandsSet.add(b);
                const c = props['addr:country'];
                if (c && /^[A-Z]{2}$/.test(c)) countriesSet.add(c);
            });
        }

        spidersData.set(spiderName, {
            latestRun,
            spiderMaps,
            config: { name: spiderName, ...spiderConfig },
            lineage,
            isBrandSpider,
            isStale,
            staleDate: isStale ? runs[effectiveLatestIndex].start_time : null,
            stabilityColour,
            stabilityValue,
            featureCounts,
            runStatuses,
            brands: Array.from(brandsSet).sort(),
            countries: Array.from(countriesSet).sort(),
        });
    }

    // Identify duplicate refs and websites across all brand spiders
    const refCounts = new Map();
    const webCounts = new Map();

    for (const [spiderName, data] of spidersData) {
        if (!data.isBrandSpider || !data.latestRun) continue;
        const spiderConfig = data.config;
        data.latestRun.features.forEach(f => {
            const props = f.properties;
            const atpRef = props.ref;
            const website = props.website;
            const nsiId = props.nsi_id;
            const wikidata = props['brand:wikidata'];

            if (!atpRef && !website) return;

            const effectiveNsiId = nsiId && getNsiIdExists(nsiId) ? nsiId : null;
            const identity = effectiveNsiId ? `nsi:${effectiveNsiId}` : wikidata ? `wd:${wikidata}` : null;

            if (identity) {
                const country = props['addr:country'];
                const refKeyName = spiderConfig.ref_key || 'ref';
                const matchingRef = refKeyName === 'branch' ? atpRef.toLowerCase() : atpRef;

                if (country && /^[A-Z]{2}$/.test(country)) {
                    const refKey = `${identity}|${refKeyName}|${matchingRef}|${country}`;
                    if (!refCounts.has(refKey)) refCounts.set(refKey, []);
                    refCounts.get(refKey).push({ spiderName, atpRef });
                }

                if (website) {
                    const normalisedWeb = normaliseWebsite(website);
                    const webKey = `${identity}|${normalisedWeb}`;
                    if (!webCounts.has(webKey)) webCounts.set(webKey, []);
                    webCounts.get(webKey).push({ spiderName, atpRef });
                }
            }
        });
    }

    const duplicateRefKeys = new Set();
    for (const [key, occurrences] of refCounts) {
        if (occurrences.length > 1) {
            const spiderNames = [...new Set(occurrences.map(o => o.spiderName))].join(', ');
            console.log(
                `Duplicate ATP ref found for ${key.split('|')[0]}: ${key
                    .split('|')
                    .slice(1)
                    .join('|')} (found in: ${spiderNames})`
            );
            duplicateRefKeys.add(key);
        }
    }

    const duplicateWebKeys = new Set();
    for (const [key, occurrences] of webCounts) {
        if (occurrences.length > 1) {
            const spiderNames = [...new Set(occurrences.map(o => o.spiderName))].join(', ');
            console.log(
                `Duplicate ATP website found for ${key.split('|')[0]}: ${key.split('|')[1]} (found in: ${spiderNames})`
            );
            duplicateWebKeys.add(key);
        }
    }

    // Build lookup and wikidataToSpiders
    for (const [spiderName, data] of spidersData) {
        if (!data.isBrandSpider || !data.latestRun) continue;
        const spiderConfig = data.config;
        data.latestRun.features.forEach(f => {
            const props = f.properties;
            let brand = props.brand;
            let wikidata = props['brand:wikidata'];
            const atpRef = props.ref;
            const website = props.website;
            const nsiId = props.nsi_id;

            if (!atpRef && !website) return;

            let effectiveNsiId = null;
            if (nsiId && getNsiIdExists(nsiId)) {
                effectiveNsiId = nsiId;
                const nsiEntry = getNsiItem(nsiId);
                brand = nsiEntry.originalTags.brand || nsiEntry.originalTags.name || brand;
                wikidata =
                    nsiEntry.originalTags['brand:wikidata'] || nsiEntry.originalTags['operator:wikidata'] || wikidata;
            }

            if (wikidata) {
                if (!wikidataToSpiders.has(wikidata)) wikidataToSpiders.set(wikidata, new Set());
                wikidataToSpiders.get(wikidata).add(spiderName);
            }

            const identity = effectiveNsiId ? `nsi:${effectiveNsiId}` : wikidata ? `wd:${wikidata}` : null;

            if (brand && wikidata && identity) {
                const country = props['addr:country'];
                if (atpRef && country && /^[A-Z]{2}$/.test(country)) {
                    const refKeyName = spiderConfig.ref_key || 'ref';
                    const matchingRef = refKeyName === 'branch' ? atpRef.toLowerCase() : atpRef;
                    const refKey = `${identity}|${refKeyName}|${matchingRef}|${country}`;

                    if (!duplicateRefKeys.has(refKey)) {
                        const key = `ref|${brand}|${wikidata}|${refKeyName}|${matchingRef}|${country}`;
                        if (!atpLookup.has(key)) atpLookup.set(key, []);
                        atpLookup.get(key).push({ spiderName, atpRef, nsiId: effectiveNsiId });
                    }
                }

                if (website) {
                    const normalisedWeb = normaliseWebsite(website);
                    const webKey = `${identity}|${normalisedWeb}`;
                    if (!duplicateWebKeys.has(webKey)) {
                        const key = `web|${brand}|${wikidata}|${normalisedWeb}`;
                        if (!atpLookup.has(key)) atpLookup.set(key, []);
                        atpLookup.get(key).push({ spiderName, atpRef, nsiId: effectiveNsiId });
                    }
                }
            }
        });
    }

    return { spidersData, atpLookup, wikidataToSpiders };
}
