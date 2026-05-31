import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import readline from 'readline';
import opening_hours from 'opening_hours';
import { LRUCache } from 'lru-cache';
import { parsePhoneNumber } from 'libphonenumber-js';
import normalizeUrl from 'normalize-url';
import eta from './eta.js';
import { isAllowedSourceUri } from './utils.js';

const CONFIG_FILE = 'config.json';
const SPIDERS_FILE = 'spiders.json';

const ohCache = new LRUCache({ max: 1000 });

export function getOH(value) {
    if (!value) return null;
    if (ohCache.has(value)) return ohCache.get(value);

    try {
        const oh = new opening_hours(value);
        ohCache.set(value, oh);
        return oh;
    } catch {
        ohCache.set(value, null);
        return null;
    }
}

export function areOpeningHoursEqual(v1, v2) {
    if (v1 === v2) return true;
    const oh1 = getOH(v1);
    const oh2 = getOH(v2);

    if (oh1 === null && oh2 === null) {
        return true;
    }

    if (oh1 && oh2) {
        return oh1.isEqualTo(oh2)[0];
    }

    return false;
}

export function arePhonesEqual(v1, v2, country) {
    if (v1 === v2) return true;
    if (!v1 || !v2) return false;

    let p1, p2;
    try {
        p1 = parsePhoneNumber(v1, country);
        if (!p1.isValid()) p1 = null;
    } catch {
        p1 = null;
    }
    try {
        p2 = parsePhoneNumber(v2, country);
        if (!p2.isValid()) p2 = null;
    } catch {
        p2 = null;
    }

    if (p1 && p2) {
        return p1.number === p2.number;
    }

    return false;
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

export function areWebsitesEqual(v1, v2) {
    if (v1 === v2) return true;
    if (!v1 || !v2) return false;

    try {
        const options = { forceHttps: true };
        const n1 = normalizeUrl(v1, options);
        const n2 = normalizeUrl(v2, options);
        return n1 === n2;
    } catch {
        return v1 === v2;
    }
}

export function areTagsEqual(tag, v1, v2, country) {
    if (tag === 'opening_hours') {
        return areOpeningHoursEqual(v1, v2);
    } else if (tag === 'phone') {
        return arePhonesEqual(v1, v2, country);
    } else if (tag === 'website') {
        return areWebsitesEqual(v1, v2);
    } else if (tag.startsWith('fuel:')) {
        const normalizeFuel = v => {
            if (v === null || v === undefined) return null;
            const s = v.toString().toLowerCase().trim();
            if (s === 'yes' || s === 'true' || s === '1') return 'yes';
            if (s === 'no' || s === 'false' || s === '0') return 'no';
            return s;
        };
        return normalizeFuel(v1) === normalizeFuel(v2);
    }
    return v1 === v2;
}

export const STATUS_PRIORITY = [
    'disallowed source uri',
    'duplicate ref',
    'mismatch',
    'update OSM',
    'not mapped',
    'no OSM tag',
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

    for (const spider of spiders) {
        console.log(`Loading ATP data for spider: ${spider.name}`);
        const spiderRuns = [];
        for (const runId of runIds) {
            const url = `${ATP_BASE_URL}/${runId}/output/${spider.name}.geojson`;
            try {
                const response = await axios.get(url);
                spiderRuns.push(response.data);
            } catch (error) {
                console.error(`Error downloading ${url}: ${error.message}`);
                spiderRuns.push(null);
            }
        }

        if (spiderRuns.some(run => run === null)) {
            console.error(`Skipping ${spider.name} due to missing run data.`);
            continue;
        }

        const latestRun = spiderRuns[3];
        const spiderMaps = spiderRuns.map(run => {
            const map = new Map();
            run.features.forEach(f => {
                const val = f.properties[spider.matchingKey];
                if (val) {
                    map.set(val, f.properties);
                }
            });
            return map;
        });

        spidersData.set(spider.name, {
            latestRun,
            spiderMaps,
            config: spider,
        });

        // Build lookup
        latestRun.features.forEach(f => {
            const props = f.properties;
            const brand = props.brand;
            const wikidata = props['brand:wikidata'];
            const ref = props.ref;
            const website = props.website;
            const matchingValue = props[spider.matchingKey];

            if (brand && wikidata && matchingValue) {
                if (ref) {
                    const key = `ref|${brand}|${wikidata}|${ref}`;
                    if (!atpLookup.has(key)) atpLookup.set(key, []);
                    atpLookup.get(key).push({ spiderName: spider.name, matchingValue });
                }
                if (website) {
                    const key = `web|${brand}|${wikidata}|${website}`;
                    if (!atpLookup.has(key)) atpLookup.set(key, []);
                    atpLookup.get(key).push({ spiderName: spider.name, matchingValue });
                }
            }
        });
    }
    return { spidersData, atpLookup };
}

function parseOplTags(tagsStr) {
    const tags = {};
    if (!tagsStr || tagsStr === 'T') return tags;

    // OPL tags are comma-separated: Tkey1=val1,key2=val2
    // Keys and values are percent-encoded.
    // OPL uses %HH encoding but also uses % for spaces in some cases or literally.
    // Actually, osmium OPL documentation says it uses %HH encoding for:
    // comma, equal sign, and all characters < 32 or > 126. Space is 32.
    // My previous test showed "Port%20%Elizabeth" which is weird.
    const parts = tagsStr.substring(1).split(',');
    for (const part of parts) {
        const eqIdx = part.indexOf('=');
        if (eqIdx !== -1) {
            const encodedKey = part.substring(0, eqIdx);
            const encodedVal = part.substring(eqIdx + 1);

            const decode = str => {
                // OPL format uses %HEX% encoding for characters.
                return str.replace(/%([0-9A-Fa-f]+)%/g, (match, hex) => {
                    return String.fromCodePoint(parseInt(hex, 16));
                });
            };

            tags[decode(encodedKey)] = decode(encodedVal);
        }
    }
    return tags;
}

async function streamOsmData(url, atpLookup, allMatches) {
    console.log(`Streaming OSM data from ${url}...`);

    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
    });

    const tagsFilter = spawn('osmium', [
        'tags-filter',
        '-',
        'nwr/brand',
        'nwr/brand:wikidata',
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
        const ref = props.ref;
        const website = props.website;

        const entry = {
            id: id,
            tags: props,
        };

        const keys = [];
        if (ref) keys.push(`ref|${brand}|${wikidata}|${ref}`);
        if (website) keys.push(`web|${brand}|${wikidata}|${website}`);

        const matchedAtpFeatures = new Set();

        for (const key of keys) {
            if (atpLookup.has(key)) {
                for (const match of atpLookup.get(key)) {
                    const matchId = `${match.spiderName}|${match.matchingValue}`;
                    if (!matchedAtpFeatures.has(matchId)) {
                        matchedAtpFeatures.add(matchId);

                        const spiderMatches = allMatches.get(match.spiderName);
                        if (!spiderMatches.has(match.matchingValue)) {
                            spiderMatches.set(match.matchingValue, []);
                        }
                        spiderMatches.get(match.matchingValue).push(entry);
                        console.log(`[MATCH] OSM:${id} matches ${match.spiderName} (${match.matchingValue})`);
                    }
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

async function processSpiderResults(spiderData, spiderMatches, runs) {
    const { latestRun, spiderMaps, config: spider } = spiderData;
    console.log(`Processing spider results: ${spider.name}`);

    const reportFile = `${spider.name}_report.txt`;
    const stream = fs.createWriteStream(reportFile);
    const results = [];

    for (const feature of latestRun.features) {
        const props = feature.properties;
        const matchingValue = props[spider.matchingKey];
        if (!matchingValue) continue;

        let itemStatus;
        const itemTags = [];
        let osmId = null;

        if (!isAllowedSourceUri(props['@source_uri'], spider.source_uri)) {
            itemStatus = 'disallowed source uri';
            for (const tag of spider.importableTags) {
                itemTags.push({
                    tag,
                    status: 'disallowed source uri',
                    osmValue: null,
                    spiderValue: props[tag] || null,
                });
            }
        } else {
            const matchEntries = spiderMatches.get(matchingValue) || [];

            // We handle importable tags
            for (const tag of spider.importableTags) {
                const country = props['addr:country'];
                let status;
                let osmValue = null;
                let spiderValue = props[tag] || null;

                if (tag === 'phone') {
                    spiderValue = formatPhone(spiderValue, country);
                }

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

                if (!spiderValue) {
                    continue;
                }

                const nonNullValues = history.map(h => h.value).filter(v => v !== null);
                const isStable =
                    nonNullValues.length <= 1 || nonNullValues.every(v => areTagsEqual(tag, v, spiderValue, country));

                if (matchEntries.length > 1) {
                    status = 'duplicate ref';
                } else if (matchEntries.length === 1) {
                    const osm = matchEntries[0];
                    osmId = osm.id;
                    osmValue = osm.tags[tag] || null;
                    if (tag === 'phone' && osmValue) {
                        osmValue = formatPhone(osmValue, country);
                    }

                    if (!osmValue) {
                        status = 'no OSM tag';
                    } else if (areTagsEqual(tag, osmValue, spiderValue, country)) {
                        status = 'matching';
                    } else {
                        // Check for update OSM
                        let canUpdate = false;
                        if (nonNullValues.length === 4) {
                            const [v1, v2, v3, v4] = nonNullValues;
                            if (
                                areTagsEqual(tag, v1, v2, country) &&
                                areTagsEqual(tag, v3, v4, country) &&
                            areTagsEqual(tag, osmValue, v1, country) &&
                            !areTagsEqual(tag, osmValue, v4, country)
                            ) {
                                canUpdate = true;
                            }
                        } else if (nonNullValues.length === 3) {
                            const [v1, v2, v3] = nonNullValues;
                            if (
                                areTagsEqual(tag, v2, v3, country) &&
                            areTagsEqual(tag, osmValue, v1, country) &&
                            !areTagsEqual(tag, osmValue, v3, country)
                            ) {
                                canUpdate = true;
                            }
                        }

                        if (canUpdate) {
                            status = 'update OSM';
                        } else {
                            status = 'mismatch';
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

        stream.write(`Ref: ${matchingValue}, Status: ${itemStatus}\n`);
        results.push({
            ref: matchingValue,
            matchingKey: spider.matchingKey,
            status: itemStatus,
            tags: itemTags,
            osmId,
            isMapped: (spiderMatches.get(matchingValue) || []).length > 0,
            allAtpTags: props,
        });
    }

    stream.end();
    console.log(`Report for ${spider.name} saved to ${reportFile}`);
    return results;
}

function generateWebpage(allSpiderResults, atpDate, osmDate) {
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
        });
        fs.writeFileSync(path.join(outputDir, `${spider.name}.html`), spiderHtml);
    });

    // Generate Index Page
    const indexHtml = eta.render('./index', {
        title: 'Dashboard',
        allSpiderResults,
        atpDate,
        osmDate,
    });
    fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml);

    // Copy spider.js
    fs.copyFileSync(path.join('src', 'templates', 'spider.js'), path.join(outputDir, 'spider.js'));
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

    const { spidersData, atpLookup } = await loadAllAtpData(spiders, runs);

    const allMatches = new Map();
    for (const spiderName of spidersData.keys()) {
        allMatches.set(spiderName, new Map());
    }

    await streamOsmData(config.osmExtractUrl, atpLookup, allMatches);

    const allSpiderResults = [];
    for (const [spiderName, data] of spidersData) {
        const results = await processSpiderResults(data, allMatches.get(spiderName), runs);
        if (results) {
            allSpiderResults.push({
                name: spiderName,
                importableTags: data.config.importableTags,
                results: results,
            });
        }
    }

    generateWebpage(allSpiderResults, atpDate, osmDate);
}

if (process.argv[1] === import.meta.filename || process.argv[1]?.endsWith('sync.js')) {
    run().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
