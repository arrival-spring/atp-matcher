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
    } catch {
        p1 = null;
    }
    try {
        p2 = parsePhoneNumber(v2, country);
    } catch {
        p2 = null;
    }

    if (p1 && p2) {
        return p1.number === p2.number;
    }

    return false;
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
    }
    return v1 === v2;
}

export const STATUS_PRIORITY = [
    'disallowed source uri',
    'duplicate ref',
    'mismatch',
    'update OSM',
    'not in OSM',
    'no OSM tag',
    'no spider tag',
    'matching',
];

export function getOverallStatus(statuses) {
    for (const p of STATUS_PRIORITY) {
        if (statuses.includes(p)) return p;
    }
    return 'matching';
}

const HISTORY_URL = 'https://data.alltheplaces.xyz/runs/history.json';
const ATP_BASE_URL = 'https://alltheplaces-data.openaddresses.io/runs';

async function getRunIds() {
    console.log('Fetching ATP run history...');
    const response = await axios.get(HISTORY_URL);
    // history.json is an array of run objects, oldest first.
    // We want the last four elements.
    return response.data.slice(-4).map(run => run.run_id);
}

async function loadAllAtpData(config, runIds) {
    const spidersData = new Map();
    const atpLookup = new Map();

    for (const spider of config.spiders) {
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

async function processSpiderResults(spiderData, spiderMatches) {
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
                    osmValue: 'N/A',
                    spiderValue: props[tag] || 'N/A',
                });
            }
        } else {
            const matchEntries = spiderMatches.get(matchingValue) || [];

            // We handle importable tags
            for (const tag of spider.importableTags) {
                const country = props['addr:country'];
                let status;
                let osmValue = 'N/A';
                let spiderValue = props[tag] || 'N/A';

                if (tag === 'phone' && props[tag]) {
                    try {
                        const p = parsePhoneNumber(props[tag], country);
                        if (!p || !p.isValid()) {
                            continue;
                        }
                    } catch {
                        continue;
                    }
                }

                if (matchEntries.length > 1) {
                    status = 'duplicate ref';
                } else if (matchEntries.length === 1) {
                    const osm = matchEntries[0];
                    osmId = osm.id;
                    osmValue = osm.tags[tag] || 'N/A';

                    const h4 = props[tag];
                    const h3 = spiderMaps[2].get(matchingValue)?.[tag];
                    const h2 = spiderMaps[1].get(matchingValue)?.[tag];
                    const h1 = spiderMaps[0].get(matchingValue)?.[tag];

                    const stableOld = h1 !== undefined && areTagsEqual(tag, h1, h2, country);
                    const stableNew = h3 !== undefined && areTagsEqual(tag, h3, h4, country);

                    if (!h4) {
                        status = 'no spider tag';
                    } else if (!osm.tags[tag]) {
                        status = 'no OSM tag';
                    } else if (areTagsEqual(tag, osm.tags[tag], h4, country)) {
                        status = 'matching';
                    } else if (
                        stableOld &&
                        stableNew &&
                        areTagsEqual(tag, osm.tags[tag], h1, country) &&
                        !areTagsEqual(tag, osm.tags[tag], h4, country)
                    ) {
                        status = 'update OSM';
                    } else {
                        status = 'mismatch';
                    }
                } else {
                    status = 'not in OSM';
                }

                itemTags.push({
                    tag,
                    status,
                    osmValue,
                    spiderValue,
                });
            }
            itemStatus = getOverallStatus(itemTags.map(t => t.status));
        }

        stream.write(`Ref: ${matchingValue}, Status: ${itemStatus}\n`);
        results.push({
            ref: matchingValue,
            status: itemStatus,
            tags: itemTags,
            osmId,
        });
    }

    stream.end();
    console.log(`Report for ${spider.name} saved to ${reportFile}`);
    return results;
}

function generateWebpage(allSpiderResults) {
    const outputDir = 'output';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    const lastSync = new Date().toLocaleString();

    // Generate Spider Pages
    allSpiderResults.forEach(spider => {
        const spiderHtml = eta.render('./spider', {
            title: spider.name,
            name: spider.name,
            importableTags: spider.importableTags,
            lastSync,
            results: spider.results,
        });
        fs.writeFileSync(path.join(outputDir, `${spider.name}.html`), spiderHtml);
    });

    // Generate Index Page
    const indexHtml = eta.render('./index', {
        title: 'Dashboard',
        allSpiderResults,
        lastSync,
    });
    fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml);
}

async function run() {
    if (!fs.existsSync(CONFIG_FILE)) {
        console.error('Config file not found.');
        return;
    }
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const runIds = await getRunIds();
    console.log(`Using runs: ${runIds.join(', ')}`);

    const { spidersData, atpLookup } = await loadAllAtpData(config, runIds);

    const allMatches = new Map();
    for (const spiderName of spidersData.keys()) {
        allMatches.set(spiderName, new Map());
    }

    await streamOsmData(config.osmExtractUrl, atpLookup, allMatches);

    const allSpiderResults = [];
    for (const [spiderName, data] of spidersData) {
        const results = await processSpiderResults(data, allMatches.get(spiderName));
        if (results) {
            allSpiderResults.push({
                name: spiderName,
                importableTags: data.config.importableTags,
                results: results,
            });
        }
    }

    generateWebpage(allSpiderResults);
}

if (process.argv[1] === import.meta.filename || process.argv[1]?.endsWith('sync.js')) {
    run().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
