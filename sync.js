import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import readline from 'readline';
import opening_hours from 'opening_hours';
import { LRUCache } from 'lru-cache';
import eta from './src/eta.js';

const CONFIG_FILE = 'config.json';

const ohCache = new LRUCache({ max: 1000 });

function getOH(value) {
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

function areOpeningHoursEqual(v1, v2) {
    if (v1 === v2) return true;
    const oh1 = getOH(v1);
    const oh2 = getOH(v2);

    if (oh1 === null && oh2 === null) {
        // Both invalid or empty, we already checked v1 === v2,
        // but they might be different invalid strings.
        // User said: "Invalid should be ignored and treated as empty or null"
        // and "If both OSM and the spider have the exact same string, but it's invalid for the library, should they be considered 'matching'? Yes"
        // If they are different but both invalid, treated as null, so they match.
        return true;
    }

    if (oh1 && oh2) {
        return oh1.isEqualTo(oh2)[0];
    }

    return false;
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

async function downloadOSM(url, dest) {
    console.log(`Downloading OSM extract from ${url}...`);
    const writer = fs.createWriteStream(dest);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

async function getOsmData(osmFile) {
    console.log('Filtering and exporting OSM data...');
    const filteredPbf = 'filtered.osm.pbf';
    try {
        // Broad filter for elements having a brand tag.
        // We will refine in-process to meet the "brand AND brand:wikidata AND (ref OR website)" requirement.
        execSync(`osmium tags-filter ${osmFile} nwr/brand -o ${filteredPbf} --overwrite`);
    } catch (error) {
        console.error('Osmium tags-filter failed. Make sure osmium-tool is installed.');
        throw error;
    }

    const osmData = new Map();

    // Export to GeoJSONSeq for streaming processing
    const osmiumExport = spawn('osmium', ['export', filteredPbf, '-f', 'geojsonseq', '--overwrite']);
    const rl = readline.createInterface({
        input: osmiumExport.stdout,
        terminal: false,
    });

    for await (const line of rl) {
        if (!line.trim()) continue;
        let feature;
        try {
            feature = JSON.parse(line);
        } catch {
            continue;
        }
        const props = feature.properties;

        const brand = props.brand;
        const wikidata = props['brand:wikidata'];
        const ref = props.ref;
        const website = props.website;

        // Requirement: brand AND brand:wikidata AND (ref OR website)
        if (brand && wikidata && (ref || website)) {
            const entry = {
                id: feature.id,
                tags: props,
            };

            // Index by ref
            if (ref) {
                const key = `ref|${brand}|${wikidata}|${ref}`;
                if (!osmData.has(key)) osmData.set(key, []);
                osmData.get(key).push(entry);
            }
            // Index by website
            if (website) {
                const key = `web|${brand}|${wikidata}|${website}`;
                if (!osmData.has(key)) osmData.set(key, []);
                osmData.get(key).push(entry);
            }
        }
    }

    if (fs.existsSync(filteredPbf)) fs.unlinkSync(filteredPbf);
    return osmData;
}

async function processSpider(spider, runIds, osmData) {
    console.log(`Processing spider: ${spider.name}`);
    const spiderRuns = [];

    for (const runId of runIds) {
        const url = `${ATP_BASE_URL}/${runId}/output/${spider.name}.geojson`;
        console.log(`Downloading spider data for run ${runId}...`);
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
        return null;
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

    const reportFile = `${spider.name}_report.txt`;
    const stream = fs.createWriteStream(reportFile);
    const results = [];

    for (const feature of latestRun.features) {
        const props = feature.properties;
        const matchingValue = props[spider.matchingKey];
        if (!matchingValue) continue;

        const brand = props.brand;
        const wikidata = props['brand:wikidata'];
        const ref = props.ref;
        const website = props.website;

        // Match in OSM
        const matchesMap = new Map();
        if (brand && wikidata) {
            if (ref) {
                const keyRef = `ref|${brand}|${wikidata}|${ref}`;
                if (osmData.has(keyRef)) {
                    osmData.get(keyRef).forEach(m => matchesMap.set(m.id, m));
                }
            }
            if (website) {
                const keyWeb = `web|${brand}|${wikidata}|${website}`;
                if (osmData.has(keyWeb)) {
                    osmData.get(keyWeb).forEach(m => matchesMap.set(m.id, m));
                }
            }
        }

        const matchEntries = Array.from(matchesMap.values());

        // We handle importable tags (currently just opening_hours)
        for (const tag of spider.importableTags) {
            let status;
            let osmValue = 'N/A';
            let spiderValue = props[tag] || 'N/A';
            let osmId = null;

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

                const stableOld = h1 !== undefined && areOpeningHoursEqual(h1, h2);
                const stableNew = h3 !== undefined && areOpeningHoursEqual(h3, h4);

                if (!h4) {
                    status = 'no spider hours';
                } else if (!osm.tags[tag]) {
                    status = 'no OSM hours';
                } else if (areOpeningHoursEqual(osm.tags[tag], h4)) {
                    status = 'matching';
                } else if (
                    stableOld &&
                    stableNew &&
                    areOpeningHoursEqual(osm.tags[tag], h1) &&
                    !areOpeningHoursEqual(osm.tags[tag], h4)
                ) {
                    status = 'update OSM';
                } else {
                    status = 'mismatch';
                }
            } else {
                status = 'not in OSM';
            }

            stream.write(
                `Ref: ${matchingValue}, Tag: ${tag}, Status: ${status}, OSM: ${osmValue}, Spider: ${spiderValue}\n`
            );
            results.push({
                ref: matchingValue,
                tag,
                status,
                osmValue,
                spiderValue,
                osmId,
            });
        }
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
        const grouped = {};
        spider.results.forEach(r => {
            if (!grouped[r.status]) grouped[r.status] = [];
            grouped[r.status].push(r);
        });

        const spiderHtml = eta.render('./spider', {
            title: spider.name,
            name: spider.name,
            lastSync,
            grouped,
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

    const osmFile = 'extract.osm.pbf';

    await downloadOSM(config.osmExtractUrl, osmFile);
    const osmData = await getOsmData(osmFile);

    const allSpiderResults = [];
    for (const spider of config.spiders) {
        const results = await processSpider(spider, runIds, osmData);
        if (results) {
            allSpiderResults.push({
                name: spider.name,
                results: results,
            });
        }
    }

    generateWebpage(allSpiderResults);

    if (fs.existsSync(osmFile)) fs.unlinkSync(osmFile);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
