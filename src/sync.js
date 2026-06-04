if (process.env.NO_DEBUG === 'true') {
    console.debug = () => {};
}

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import slugify from 'slugify';
import { countries as countriesList } from 'countries-list';
import readline from 'readline';
import opening_hours from 'opening_hours';
import { LRUCache } from 'lru-cache';
import { parsePhoneNumber } from 'libphonenumber-js';
import normalizeUrl from 'normalize-url';
import eta from './eta.js';
import { isAllowedSourceUri, matchesCategories } from './utils.js';
import { getNsiEffectiveTags, getNsiIdExists, getNsiItem } from './nsi_utils.js';

const CONFIG_FILE = 'config.json';
const SPIDERS_FILE = 'spiders.json';

const ohCache = new LRUCache({ max: 1000 });
const ohCompareCache = new LRUCache({ max: 5000 });

export function getOH(value, country) {
    if (!value) return null;
    const cacheKey = country ? `${value}|${country}` : value;
    if (ohCache.has(cacheKey)) return ohCache.get(cacheKey);

    try {
        const options = country ? { address: { country_code: country.toLowerCase() } } : undefined;
        const oh = new opening_hours(value, options);
        ohCache.set(cacheKey, oh);
        return oh;
    } catch {
        ohCache.set(cacheKey, null);
        return null;
    }
}

export function areOpeningHoursEqual(v1, v2, country) {
    if (v1 === v2) return true;

    const cacheKey = `${v1}|${v2}|${country}`;
    if (ohCompareCache.has(cacheKey)) return ohCompareCache.get(cacheKey);

    const oh1 = getOH(v1, country);
    const oh2 = getOH(v2, country);

    let result = false;
    if (oh1 === null && oh2 === null) {
        result = true;
    } else if (oh1 && oh2) {
        result = oh1.isEqualTo(oh2)[0];
    }

    if (!result && v1 && v2 && v1.includes('PH') && !v2.includes('PH')) {
        let transformedV1 = v1;
        transformedV1 = transformedV1.replace(/,\s?PH/g, '');
        transformedV1 = transformedV1.replace(/^PH,\s?/, '');
        transformedV1 = transformedV1.replace(/;\s?PH[^;]+$/, '');

        const oh1Transformed = getOH(transformedV1, country);
        if (oh1Transformed && oh2) {
            result = oh1Transformed.isEqualTo(oh2)[0];
        }
    }

    ohCompareCache.set(cacheKey, result);
    return result;
}

export function arePhonesEqual(osmValue, atpValue, country) {
    if (osmValue === atpValue) return true;
    if (!atpValue) return true; // If ATP has no value, any OSM value is fine (though in this context atpValue is expected if called)

    const splitValues = val => (val ? val.split(';').map(v => v.trim()) : []);

    const atpList = splitValues(atpValue)
        .map(v => {
            try {
                const p = parsePhoneNumber(v, country);
                return p.isValid() ? p.number : null;
            } catch {
                return null;
            }
        })
        .filter(v => v !== null);

    if (atpList.length === 0) return true; // Discard invalid ATP values, if none left, treat as match

    const osmList = splitValues(osmValue)
        .map(v => {
            try {
                const p = parsePhoneNumber(v, country);
                return p.isValid() ? p.number : null;
            } catch {
                return null;
            }
        })
        .filter(v => v !== null);

    // All ATP values must be in OSM
    return atpList.every(v => osmList.includes(v));
}

export function formatPhone(value, country) {
    if (!value) return null;
    try {
        const p = parsePhoneNumber(value, country);
        if (p.isValid()) {
            return p.formatInternational();
        }
    } catch {
        // ignore
    }
    return null;
}

export function normalizeWebsite(url) {
    if (!url) return null;
    try {
        return normalizeUrl(url, { forceHttps: true });
    } catch {
        return url;
    }
}

export function areWebsitesEqual(v1, v2) {
    if (v1 === v2) return true;
    if (!v1 || !v2) return false;
    return normalizeWebsite(v1) === normalizeWebsite(v2);
}

export function areEmailsEqual(osmValue, atpValue) {
    if (osmValue === atpValue) return true;
    if (!atpValue) return true;

    const splitValues = val => (val ? val.split(';').map(v => v.trim().toLowerCase()) : []);

    const atpList = splitValues(atpValue).filter(v => v !== '');
    if (atpList.length === 0) return true;

    const osmList = splitValues(osmValue).filter(v => v !== '');

    // All ATP values must be in OSM
    return atpList.every(v => osmList.includes(v));
}

export function areTagsEqual(tag, osmValue, atpValue, country) {
    if (tag === 'opening_hours') {
        return areOpeningHoursEqual(osmValue, atpValue, country);
    } else if (tag === 'phone') {
        return arePhonesEqual(osmValue, atpValue, country);
    } else if (tag === 'website') {
        return areWebsitesEqual(osmValue, atpValue);
    } else if (tag === 'email') {
        return areEmailsEqual(osmValue, atpValue);
    } else if (tag.startsWith('fuel:')) {
        const normalizeFuel = v => {
            if (v === null || v === undefined) return null;
            const s = v.toString().toLowerCase().trim();
            if (s === 'yes' || s === 'true' || s === '1') return 'yes';
            if (s === 'no' || s === 'false' || s === '0') return 'no';
            return s;
        };
        return normalizeFuel(osmValue) === normalizeFuel(atpValue);
    }
    return osmValue === atpValue;
}

export const STATUS_PRIORITY = [
    'not a brand spider',
    'disallowed source uri',
    'duplicate ref',
    'mismatch',
    'update OSM',
    'not mapped',
    'Add to OSM',
    'matching',
];

export function getOverallStatus(statuses) {
    if (statuses.length === 0) return 'matching';
    for (const p of STATUS_PRIORITY) {
        if (statuses.includes(p)) return p;
    }
    return 'matching';
}

const HISTORY_URL = 'https://data.alltheplaces.xyz/runs/history.json';
const ATP_BASE_URL = 'https://alltheplaces-data.openaddresses.io/runs';

async function getRuns() {
    console.log('Fetching ATP run history...');
    const response = await axios.get(HISTORY_URL);
    // history.json is an array of run objects, oldest first.
    // We want the last four elements.
    return response.data.slice(-4);
}

async function loadAllAtpData(spiders, runs) {
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

function parseOplTags(tagsStr) {
    const tags = {};
    if (!tagsStr || tagsStr === 'T') return tags;

    const parts = tagsStr.substring(1).split(',');
    for (const part of parts) {
        const eqIdx = part.indexOf('=');
        if (eqIdx !== -1) {
            const encodedKey = part.substring(0, eqIdx);
            const encodedVal = part.substring(eqIdx + 1);

            const decode = str => {
                // OPL format uses %HEX% encoding for characters.
                return str.replace(/%([0-9A-Fa-f]{1,6})%/g, (match, hex) => {
                    return String.fromCodePoint(parseInt(hex, 16));
                });
            };

            tags[decode(encodedKey)] = decode(encodedVal);
        }
    }
    return tags;
}

async function streamOsmData(url, spiders, atpLookup, wikidataToSpiders, allMatches, allUnmatched) {
    console.log(`Streaming OSM data from ${url}...`);

    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
    });

    const refKeys = new Set(['ref']);
    for (const spider of spiders) {
        if (spider.ref_key) {
            refKeys.add(spider.ref_key);
        }
    }

    const filterArgs = [
        'tags-filter',
        '-',
        'nwr/brand',
        'nwr/brand:wikidata',
        'nwr/website',
        'nwr/contact:website',
        'nwr/phone',
        'nwr/contact:phone',
        'nwr/email',
        'nwr/contact:email',
    ];
    for (const key of refKeys) {
        filterArgs.push(`nwr/${key}`);
    }

    const tagsFilter = spawn('osmium', [
        ...filterArgs,
        '--input-format=pbf',
        '--output-format=opl',
        '--omit-referenced',
    ]);

    tagsFilter.stderr.on('data', data => console.error(`[tags-filter] ${data}`));

    response.data.pipe(tagsFilter.stdin);

    const rl = readline.createInterface({
        input: tagsFilter.stdout,
        terminal: false,
    });

    for await (const line of rl) {
        if (!line.trim()) continue;

        // OPL format: [node|way|relation]ID [vVersion] [dV] [cChangeset] [tTimestamp] [iUid] [uUser] [Ttags] [xLon yLat]|[Nnodes]|[Mmembers]
        const parts = line.split(' ');
        const id = parts[0];
        const tagsPart = parts.find(p => p.startsWith('T'));

        if (!tagsPart) continue;

        const props = parseOplTags(tagsPart);
        const brand = props.brand;
        const wikidata = props['brand:wikidata'];
        const website = props.website || props['contact:website'];

        const entry = {
            id: id,
            tags: props,
        };

        const matchedAtpFeatures = new Set();
        const matchedSpiders = new Set();

        // 1. Try matching by website
        if (website) {
            const normalizedWeb = normalizeWebsite(website);
            const key = `web|${brand}|${wikidata}|${normalizedWeb}`;
            if (atpLookup.has(key)) {
                for (const match of atpLookup.get(key)) {
                    const matchId = `${match.spiderName}|${match.atpRef}`;
                    if (!matchedAtpFeatures.has(matchId)) {
                        if (match.nsiId) {
                            const nsiTags = getNsiEffectiveTags(match.nsiId);
                            const nsiMatch = Object.entries(nsiTags).every(([k, v]) => props[k] === v);
                            if (!nsiMatch) continue;
                        }

                        matchedAtpFeatures.add(matchId);
                        matchedSpiders.add(match.spiderName);
                        const spiderMatches = allMatches.get(match.spiderName);
                        if (!spiderMatches.has(match.atpRef)) {
                            spiderMatches.set(match.atpRef, []);
                        }
                        spiderMatches.get(match.atpRef).push(entry);
                        console.debug(`[MATCH web] OSM:${id} matches ${match.spiderName} (${match.atpRef})`);
                    }
                }
            }
        }

        // 2. Try matching by ref/ref_key
        for (const spider of spiders) {
            const refKeyName = spider.ref_key || 'ref';
            const osmRefValue = props[refKeyName];
            if (osmRefValue) {
                const matchingRef = refKeyName === 'branch' ? osmRefValue.toLowerCase() : osmRefValue;
                const key = `ref|${brand}|${wikidata}|${refKeyName}|${matchingRef}`;
                if (atpLookup.has(key)) {
                    for (const match of atpLookup.get(key)) {
                        // Ensure we are matching the correct spider
                        if (match.spiderName !== spider.name) continue;

                        const matchId = `${match.spiderName}|${match.atpRef}`;
                        if (!matchedAtpFeatures.has(matchId)) {
                            if (match.nsiId) {
                                const nsiTags = getNsiEffectiveTags(match.nsiId);
                                const nsiMatch = Object.entries(nsiTags).every(([k, v]) => props[k] === v);
                                if (!nsiMatch) continue;
                            }

                            matchedAtpFeatures.add(matchId);
                            matchedSpiders.add(match.spiderName);
                            const spiderMatches = allMatches.get(match.spiderName);
                            if (!spiderMatches.has(match.atpRef)) {
                                spiderMatches.set(match.atpRef, []);
                            }
                            spiderMatches.get(match.atpRef).push(entry);
                            console.debug(`[MATCH ref] OSM:${id} matches ${match.spiderName} (${match.atpRef})`);
                        }
                    }
                }
            }
        }

        // 3. Collect potentially unmatched elements
        if (wikidata && wikidataToSpiders.has(wikidata)) {
            for (const spiderName of wikidataToSpiders.get(wikidata)) {
                if (matchedSpiders.has(spiderName)) continue;

                const spider = spiders.find(s => s.name === spiderName);
                if (spider && spider.showUnmatched && matchesCategories(props, spider.categories)) {
                    if (!allUnmatched.has(spiderName)) allUnmatched.set(spiderName, new Map());
                    allUnmatched.get(spiderName).set(id, entry);
                }
            }
        }
    }

    return new Promise((resolve, reject) => {
        tagsFilter.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`osmium tags-filter exited with code ${code}`));
        });
        tagsFilter.on('error', reject);
    });
}

export async function processSpiderResults(spiderData, spiderMatches, runs, safeEdits = {}) {
    const { latestRun, spiderMaps, config: spider, lineage, isBrandSpider } = spiderData;
    console.log(`Processing spider results: ${spider.name}`);

    const results = [];
    const unmapped = [];
    const usedTags = new Set();

    // Expand wildcard tags
    const expandedImportableTags = new Set();
    const wildcards = (spider.importableTags || []).filter(t => t.endsWith(':*')).map(t => t.slice(0, -1));
    const staticTags = (spider.importableTags || []).filter(t => !t.endsWith(':*'));

    staticTags.forEach(t => expandedImportableTags.add(t));

    if (wildcards.length > 0) {
        for (const feature of latestRun.features) {
            for (const key of Object.keys(feature.properties)) {
                for (const wildcard of wildcards) {
                    if (key.startsWith(wildcard)) {
                        expandedImportableTags.add(key);
                    }
                }
            }
        }
    }

    for (const feature of latestRun.features) {
        const props = feature.properties;
        const matchingValue = props.ref;
        if (!matchingValue) continue;

        let itemStatus;
        const itemTags = [];
        let osmId = null;

        const isAllowed = isAllowedSourceUri(props['@source_uri'], spider.source_uri);

        if (!isBrandSpider || !isAllowed) {
            itemStatus = !isBrandSpider ? 'not a brand spider' : 'disallowed source uri';
            const possibleTags = new Set([...expandedImportableTags, 'opening_hours', 'website']);
            for (const tag of possibleTags) {
                const spiderValue = props[tag] || null;
                if (spiderValue) {
                    itemTags.push({
                        tag,
                        status: itemStatus,
                        osmValue: null,
                        spiderValue,
                    });
                    usedTags.add(tag);
                }
            }
        } else {
            const allPossibleTags = new Set([...expandedImportableTags, 'opening_hours', 'website']);
            const matchEntries = spiderMatches.get(matchingValue) || [];
            if (matchEntries.length === 1) {
                const osm = matchEntries[0];
                for (const tag of Object.keys(osm.tags)) {
                    if (
                        expandedImportableTags.has(tag) ||
                        tag === 'opening_hours' ||
                        tag === 'website'
                    ) {
                        allPossibleTags.add(tag);
                    }
                }
            }

            // We handle importable tags
            for (const tag of allPossibleTags) {
                const country = props['addr:country'];
                let status;
                let osmValue = null;
                let spiderValue = props[tag] || null;

                if (tag === 'phone') {
                    spiderValue = formatPhone(spiderValue, country);
                }

                if (!spiderValue) {
                    continue;
                }

                usedTags.add(tag);

                const history = runs.map((run, idx) => {
                    let val = spiderMaps[idx].get(matchingValue)?.[tag] || null;
                    if (tag === 'phone' && val) {
                        val = formatPhone(val, country);
                    }
                    return {
                        date: run.run_id.substring(0, 10),
                        value: val,
                    };
                });

                const nonNullValues = history.map(h => h.value).filter(v => v !== null);
                const isStable =
                    nonNullValues.length <= 1 || nonNullValues.every(v => areTagsEqual(tag, v, spiderValue, country));

                if (matchEntries.length > 1) {
                    status = 'duplicate ref';
                } else if (matchEntries.length === 1) {
                    const osm = matchEntries[0];
                    osmId = osm.id;
                    let osmTagValue = osm.tags[tag] || null;
                    if (!osmTagValue) {
                        if (tag === 'phone') {
                            osmTagValue = osm.tags['contact:phone'] || null;
                        } else if (tag === 'website') {
                            osmTagValue = osm.tags['contact:website'] || null;
                        } else if (tag === 'email') {
                            osmTagValue = osm.tags['contact:email'] || null;
                        }
                    }
                    osmValue = osmTagValue;

                    if (!osmTagValue) {
                        const v3 = history.length >= 3 ? history[2].value : null;
                        const v4 = history.length >= 4 ? history[3].value : null;
                        if (
                            v3 !== null &&
                            v4 !== null &&
                            areTagsEqual(tag, v3, v4, country) &&
                            areTagsEqual(tag, v4, spiderValue, country)
                        ) {
                            status = 'Add to OSM';
                        } else {
                            status = 'mismatch';
                        }
                    } else {
                        if (areTagsEqual(tag, osmTagValue, spiderValue, country)) {
                            status = 'matching';
                        } else {
                            // Check for update OSM
                            let canUpdate = false;
                            const v1 = history.length >= 1 ? history[0].value : null;
                            const v2 = history.length >= 2 ? history[1].value : null;
                            const v3 = history.length >= 3 ? history[2].value : null;
                            const v4 = history.length >= 4 ? history[3].value : null;

                            if (v1 !== null && v2 !== null && v3 !== null && v4 !== null) {
                                if (
                                    areTagsEqual(tag, v1, v2, country) &&
                                    areTagsEqual(tag, v3, v4, country) &&
                                    areTagsEqual(tag, osmTagValue, v1, country) &&
                                    !areTagsEqual(tag, osmTagValue, v4, country) &&
                                    areTagsEqual(tag, v4, spiderValue, country)
                                ) {
                                    canUpdate = true;
                                }
                            }

                            if (canUpdate) {
                                if (tag === 'opening_hours' && osmTagValue.includes('PH')) {
                                    status = 'mismatch';
                                } else {
                                    status = 'update OSM';
                                }
                            } else {
                                status = 'mismatch';
                            }
                        }
                    }
                } else {
                    status = 'not mapped';
                }

                itemTags.push({
                    tag,
                    status,
                    osmValue,
                    spiderValue,
                    history,
                    isStable,
                });
            }
            itemStatus = getOverallStatus(itemTags.map(t => t.status));
        }

        const filteredAtpTags = {};
        for (const [k, v] of Object.entries(props)) {
            if (!k.startsWith('@') && k !== 'nsi_id') {
                filteredAtpTags[k] = v;
            }
        }

        const isMapped = (spiderMatches.get(matchingValue) || []).length > 0;
        const matchCount = (spiderMatches.get(matchingValue) || []).length;

        const result = {
            ref: matchingValue,
            status: itemStatus,
            tags: itemTags,
            osmId,
            isMapped,
            matchCount,
        };

        if (isMapped || itemStatus === 'disallowed source uri' || itemStatus === 'not a brand spider') {
            results.push({
                ...result,
                allAtpTags: (result.matchCount > 1 || !isMapped) ? filteredAtpTags : undefined,
            });
        } else {
            unmapped.push({
                ...result,
                allAtpTags: filteredAtpTags,
            });
        }

        // Collect safe edits
        if (osmId && (itemStatus === 'update OSM' || itemStatus === 'Add to OSM')) {
            const rawCountryCode = props['addr:country'];
            const countryCode = typeof rawCountryCode === 'string' ? rawCountryCode.toUpperCase() : null;
            const state = props['addr:state'];
            const osmType = osmId.startsWith('n') ? 'node' : osmId.startsWith('w') ? 'way' : 'relation';
            const osmNumericId = osmId.replace(/^[nwr]/, '');

            if (countryCode && /^[A-Z]{2}$/.test(countryCode)) {
                const countryInfo = countriesList[countryCode];
                if (countryInfo) {
                    const countryName = countryInfo.native;
                    const tagsToEdit = itemTags.filter(t => t.status === 'update OSM' || t.status === 'Add to OSM');

                    if (tagsToEdit.length > 0) {
                        const originalValues = {};
                        const newValues = {};
                        tagsToEdit.forEach(t => {
                            originalValues[t.tag] = t.osmValue;
                            newValues[t.tag] = t.spiderValue;
                        });

                        const edit = {
                            type: osmType,
                            id: osmNumericId,
                            originalValues,
                            newValues
                        };

                        if (!safeEdits[spider.name]) safeEdits[spider.name] = {};

                        const stateSlug = state ? slugify(state, { lower: true, remove: /[*+~.()'"!:@]/g }) : null;
                        const fileKey = stateSlug ? `${countryCode}_${stateSlug}` : countryCode;

                        if (!safeEdits[spider.name][fileKey]) {
                            safeEdits[spider.name][fileKey] = {
                                metadata: {
                                    spider: spider.name,
                                    country: countryName,
                                    countryCode,
                                    tags: []
                                },
                                edits: []
                            };
                            if (state) {
                                safeEdits[spider.name][fileKey].metadata.state = state;
                            }
                        }

                        const currentFile = safeEdits[spider.name][fileKey];
                        currentFile.edits.push(edit);
                        tagsToEdit.forEach(t => {
                            if (!currentFile.metadata.tags.includes(t.tag)) {
                                currentFile.metadata.tags.push(t.tag);
                            }
                        });
                    }
                }
            } else if (countryCode) {
                console.warn(`Spider ${spider.name} has invalid country code: ${countryCode} for ref ${matchingValue}`);
            } else {
                // Countryless
                const tagsToEdit = itemTags.filter(t => t.status === 'update OSM' || t.status === 'Add to OSM');
                if (tagsToEdit.length > 0) {
                    const originalValues = {};
                    const newValues = {};
                    tagsToEdit.forEach(t => {
                        originalValues[t.tag] = t.osmValue;
                        newValues[t.tag] = t.spiderValue;
                    });

                    const edit = {
                        type: osmType,
                        id: osmNumericId,
                        originalValues,
                        newValues
                    };

                    if (!safeEdits[spider.name]) safeEdits[spider.name] = {};
                    const fileKey = 'countryless';
                    if (!safeEdits[spider.name][fileKey]) {
                        safeEdits[spider.name][fileKey] = {
                            metadata: {
                                spider: spider.name,
                                country: 'Countryless',
                                tags: []
                            },
                            edits: []
                        };
                    }
                    const currentFile = safeEdits[spider.name][fileKey];
                    currentFile.edits.push(edit);
                    tagsToEdit.forEach(t => {
                        if (!currentFile.metadata.tags.includes(t.tag)) {
                            currentFile.metadata.tags.push(t.tag);
                        }
                    });
                }
            }
        }
    }

    return { results, unmapped, usedTags: Array.from(usedTags).sort() };
}

export function generateWebpage(allSpiderResults, atpDate, osmDate) {
    const outputDir = 'output';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    // Generate Spider Pages
    allSpiderResults.forEach(spider => {
        const spiderHtml = eta.render('./spider', {
            title: spider.name,
            name: spider.name,
            importableTags: spider.importableTags,
            atpDate,
            osmDate,
            results: spider.results,
            isBrandSpider: spider.isBrandSpider,
            lineage: spider.lineage,
            isStale: spider.isStale,
            staleDate: spider.staleDate,
            loadStatus: spider.loadStatus,
            showUnmatched: spider.showUnmatched,
            unmappedCount: spider.unmappedCount,
            unmatchedCount: spider.unmatchedCount,
        });
        fs.writeFileSync(path.join(outputDir, `${spider.name}.html`), spiderHtml);
    });

    // Generate Index Page
    const indexData = allSpiderResults.map(s => ({
        name: s.name,
        stabilityColor: s.stabilityColor,
        loadStatus: s.loadStatus,
        isBrandSpider: s.isBrandSpider,
        totalCount: s.totalCount,
        mappedCount: s.mappedCount,
        issuesCount: s.issuesCount,
        automaticUpdatesCount: s.automaticUpdatesCount,
    }));

    const indexHtml = eta.render('./index', {
        title: 'Dashboard',
        indexData,
        atpDate,
        osmDate,
    });
    fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml);

    // Copy JS files
    fs.copyFileSync(path.join('src', 'templates', 'spider.js'), path.join(outputDir, 'spider.js'));
    fs.copyFileSync(path.join('src', 'templates', 'index.js'), path.join(outputDir, 'index.js'));
}

async function run() {
    if (!fs.existsSync(CONFIG_FILE)) {
        console.error('Config file not found.');
        return;
    }
    if (!fs.existsSync(SPIDERS_FILE)) {
        console.error('Spiders file not found.');
        return;
    }
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const spiders = JSON.parse(fs.readFileSync(SPIDERS_FILE, 'utf8'));
    const runs = await getRuns();
    console.log(`Using runs: ${runs.map(r => r.run_id).join(', ')}`);

    const atpDate = runs[runs.length - 1].start_time;

    let osmDate;
    try {
        const head = await axios.head(config.osmExtractUrl);
        osmDate = head.headers['last-modified'] ? new Date(head.headers['last-modified']).toISOString() : null;
    } catch (e) {
        console.error('Failed to get OSM date', e.message);
        osmDate = new Date().toISOString();
    }

    const { spidersData, atpLookup, wikidataToSpiders } = await loadAllAtpData(spiders, runs);

    const allMatches = new Map();
    const allUnmatched = new Map();
    for (const spiderName of spidersData.keys()) {
        allMatches.set(spiderName, new Map());
    }

    await streamOsmData(config.osmExtractUrl, spiders, atpLookup, wikidataToSpiders, allMatches, allUnmatched);

    const safeEdits = {};

    const allSpiderResults = [];
    for (const [spiderName, data] of spidersData) {
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

        const { results, unmapped, usedTags } = await processSpiderResults(data, allMatches.get(spiderName), runs, safeEdits);
        if (results) {
            const isMapped = r => r.matchCount >= 1 && r.status !== 'disallowed source uri' && r.status !== 'not a brand spider';
            const mappedResults = results.filter(isMapped);
            const mappedCount = mappedResults.length;
            const issuesCount = mappedResults.filter(r => r.status !== 'matching').length;
            const automaticUpdatesCount = mappedResults.filter(r => r.status === 'update OSM' || r.status === 'Add to OSM').length;

            const unmatchedMap = allUnmatched.get(spiderName);
            const unmatched = unmatchedMap ? Array.from(unmatchedMap.values()) : [];

            // Write separate JSON files
            const outputDir = 'output';
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir);
            }
            fs.writeFileSync(path.join(outputDir, `${spiderName}_unmapped.json`), JSON.stringify(unmapped));
            fs.writeFileSync(path.join(outputDir, `${spiderName}_unmatched.json`), JSON.stringify(unmatched));

            allSpiderResults.push({
                name: spiderName,
                importableTags: usedTags,
                results: results.map(r => ({ ...r, allAtpTags: undefined })),
                isBrandSpider: data.isBrandSpider,
                lineage: data.lineage,
                isStale: data.isStale,
                staleDate: data.staleDate,
                stabilityColor: data.stabilityColor,
                loadStatus: data.loadStatus,
                showUnmatched: data.config.showUnmatched || false,
                unmappedCount: unmapped.length,
                unmatchedCount: unmatched.length,
                // Totals for index page
                totalCount: results.length + unmapped.length,
                mappedCount,
                issuesCount,
                automaticUpdatesCount,
            });
        }
    }

    generateWebpage(allSpiderResults, atpDate, osmDate);

    // Save safe edits
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
}

if (process.argv[1] === import.meta.filename || process.argv[1]?.endsWith('sync.js')) {
    run().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
