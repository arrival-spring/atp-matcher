import axios from 'axios';
import { matchesCategories } from './utils.js';
import { getNsiIdExists, getNsiItem } from './nsi_utils.js';
import { normalizeWebsite } from './tag_comparisons.js';

const HISTORY_URL = 'https://data.alltheplaces.xyz/runs/history.json';
const ATP_BASE_URL = 'https://alltheplaces-data.openaddresses.io/runs';

export async function getRuns() {
    console.log('Fetching ATP run history...');
    try {
        const response = await axios.get(HISTORY_URL);
        // history.json is an array of run objects, oldest first.
        // We want the last four elements.
        return response.data.slice(-4);
    } catch (error) {
        throw new Error(`Failed to fetch ATP run history: ${error.message}`);
    }
}

export async function loadAllAtpData(spiders, runs) {
    const runIds = runs.map(r => r.run_id);
    const spidersData = new Map();
    const atpLookup = new Map();
    const wikidataToSpiders = new Map();

    for (const spider of spiders) {
        console.log(`Loading ATP data for spider: ${spider.name}`);
        const spiderRuns = [];
        const runStatuses = []; // 'ok', '404', 'empty'
        const featureCounts = [];

        for (const runId of runIds) {
            const url = `${ATP_BASE_URL}/${runId}/output/${spider.name}.geojson`;
            try {
                const response = await axios.get(url);
                const data = response.data;
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

        const latestStatus = runStatuses[3];

        // Find effective latest run (most recent non-empty, non-404)
        let effectiveLatestIndex = -1;
        for (let i = 3; i >= 0; i--) {
            if (runStatuses[i] === 'ok') {
                effectiveLatestIndex = i;
                break;
            }
        }

        if (latestStatus === '404' || latestStatus === 'error') {
            spidersData.set(spider.name, {
                latestRun: null,
                spiderMaps: spiderRuns.map(() => new Map()),
                config: spider,
                loadStatus: 'missing',
                featureCounts,
                runStatuses,
            });
            continue;
        }

        if (effectiveLatestIndex === -1) {
            spidersData.set(spider.name, {
                latestRun: null,
                spiderMaps: spiderRuns.map(() => new Map()),
                config: spider,
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
                if (!matchesCategories(f.properties, spider.categories)) return false;
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

        // Calculate stability dot color
        const validCounts = featureCounts.filter(c => c !== null);
        let stabilityColor = 'green';
        if (!isBrandSpider) {
            stabilityColor = 'red';
        } else if (validCounts.length > 1) {
            const minCount = Math.min(...validCounts);
            const maxCount = Math.max(...validCounts);
            const discrepancy = maxCount === 0 ? 0 : (maxCount - minCount) / maxCount;
            if (discrepancy > 0.1) {
                stabilityColor = 'red';
            } else if (discrepancy > 0.05) {
                stabilityColor = 'orange';
            }
        }

        spidersData.set(spider.name, {
            latestRun,
            spiderMaps,
            config: spider,
            lineage,
            isBrandSpider,
            isStale,
            staleDate: isStale ? runs[effectiveLatestIndex].start_time : null,
            stabilityColor,
            featureCounts,
            runStatuses,
        });

        // Build lookup
        if (isBrandSpider && latestRun && latestRun.features) {
            latestRun.features.forEach(f => {
                const props = f.properties;
                let brand = props.brand;
                let wikidata = props['brand:wikidata'];
                const atpRef = props.ref;
                const website = props.website;
                const nsiId = props.nsi_id;

                let effectiveNsiId = null;
                if (nsiId && getNsiIdExists(nsiId)) {
                    effectiveNsiId = nsiId;
                    const nsiEntry = getNsiItem(nsiId);
                    brand = nsiEntry.originalTags.brand || nsiEntry.originalTags.name || brand;
                    wikidata = nsiEntry.originalTags['brand:wikidata'] || nsiEntry.originalTags['operator:wikidata'] || wikidata;
                }

                if (wikidata) {
                    if (!wikidataToSpiders.has(wikidata)) wikidataToSpiders.set(wikidata, new Set());
                    wikidataToSpiders.get(wikidata).add(spider.name);
                }

                if (brand && wikidata && atpRef) {
                    // Match by ref (using the spider's custom ref_key if provided)
                    const refKeyName = spider.ref_key || 'ref';
                    const matchingRef = refKeyName === 'branch' ? atpRef.toLowerCase() : atpRef;
                    const key = `ref|${brand}|${wikidata}|${refKeyName}|${matchingRef}`;
                    if (!atpLookup.has(key)) atpLookup.set(key, []);
                    atpLookup.get(key).push({ spiderName: spider.name, atpRef, nsiId: effectiveNsiId });

                    // Match by website
                    if (website) {
                        const normalizedWeb = normalizeWebsite(website);
                        const key = `web|${brand}|${wikidata}|${normalizedWeb}`;
                        if (!atpLookup.has(key)) atpLookup.set(key, []);
                        atpLookup.get(key).push({ spiderName: spider.name, atpRef, nsiId: effectiveNsiId });
                    }
                }
            });
        }
    }
    return { spidersData, atpLookup, wikidataToSpiders };
}
