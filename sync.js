const axios = require('axios');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const readline = require('readline');

const CONFIG_FILE = 'config.json';
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
        responseType: 'stream'
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
    } catch (e) {
        console.error('Osmium tags-filter failed. Make sure osmium-tool is installed.');
        throw e;
    }

    const osmData = new Map();

    // Export to GeoJSONSeq for streaming processing
    const osmiumExport = spawn('osmium', ['export', filteredPbf, '-f', 'geojsonseq', '--overwrite']);
    const rl = readline.createInterface({
        input: osmiumExport.stdout,
        terminal: false
    });

    for await (const line of rl) {
        if (!line.trim()) continue;
        let feature;
        try {
            feature = JSON.parse(line);
        } catch (e) {
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
                tags: props
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
        return;
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
            let status = '';
            let osmValue = 'N/A';
            let spiderValue = props[tag] || 'N/A';

            if (matchEntries.length > 1) {
                status = 'duplicate ref';
            } else if (matchEntries.length === 1) {
                const osm = matchEntries[0];
                osmValue = osm.tags[tag] || 'N/A';

                const h4 = props[tag];
                const h3 = spiderMaps[2].get(matchingValue)?.[tag];
                const h2 = spiderMaps[1].get(matchingValue)?.[tag];
                const h1 = spiderMaps[0].get(matchingValue)?.[tag];

                const stableOld = (h1 !== undefined && h1 === h2);
                const stableNew = (h3 !== undefined && h3 === h4);

                if (!h4) {
                    status = 'no spider hours';
                } else if (!osm.tags[tag]) {
                    status = 'no OSM hours';
                } else if (osm.tags[tag] === h4) {
                    status = 'matching';
                } else if (stableOld && stableNew && osm.tags[tag] === h1 && osm.tags[tag] !== h4) {
                    status = 'update OSM';
                } else {
                    status = 'mismatch';
                }
            } else {
                status = 'not in OSM';
            }

            stream.write(`Ref: ${matchingValue}, Tag: ${tag}, Status: ${status}, OSM: ${osmValue}, Spider: ${spiderValue}\n`);
        }
    }

    stream.end();
    console.log(`Report for ${spider.name} saved to ${reportFile}`);
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

    for (const spider of config.spiders) {
        await processSpider(spider, runIds, osmData);
    }

    if (fs.existsSync(osmFile)) fs.unlinkSync(osmFile);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
