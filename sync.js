const axios = require('axios');
const fs = require('fs');
const path = require('path');
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
            let status = '';
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
            results.push({
                ref: matchingValue,
                tag,
                status,
                osmValue,
                spiderValue,
                osmId
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

        const statuses = Object.keys(grouped).sort();

        let sectionsHtml = '';
        statuses.forEach(status => {
            const rows = grouped[status];
            const tableRows = rows.map(r => {
                let osmLink = 'N/A';
                if (r.osmId) {
                    const typeMap = { 'n': 'node', 'w': 'way', 'r': 'relation' };
                    const typeChar = r.osmId.toString()[0];
                    const id = r.osmId.toString().substring(1);
                    if (typeMap[typeChar]) {
                        osmLink = `<a href="https://www.openstreetmap.org/${typeMap[typeChar]}/${id}" target="_blank" class="text-blue-400 hover:underline">${r.osmId}</a>`;
                    }
                }
                return `
                    <tr class="border-b border-gray-700 hover:bg-gray-800">
                        <td class="px-4 py-2">${r.ref}</td>
                        <td class="px-4 py-2">${r.tag}</td>
                        <td class="px-4 py-2 font-mono text-sm">${r.osmValue}</td>
                        <td class="px-4 py-2 font-mono text-sm">${r.spiderValue}</td>
                        <td class="px-4 py-2">${osmLink}</td>
                    </tr>
                `;
            }).join('');

            sectionsHtml += `
                <div class="mb-12">
                    <h2 class="text-2xl font-bold mb-4 capitalize text-gray-200">${status} (${rows.length})</h2>
                    <div class="overflow-x-auto bg-gray-900 rounded-lg shadow">
                        <table class="min-w-full table-auto data-table" data-status="${status}">
                            <thead class="bg-gray-800 text-gray-400 text-left">
                                <tr>
                                    <th class="px-4 py-2">Ref</th>
                                    <th class="px-4 py-2">Tag</th>
                                    <th class="px-4 py-2">OSM Value</th>
                                    <th class="px-4 py-2">Spider Value</th>
                                    <th class="px-4 py-2">OSM Link</th>
                                </tr>
                            </thead>
                            <tbody class="text-gray-300">
                                ${tableRows}
                            </tbody>
                        </table>
                    </div>
                    <div class="mt-4 flex justify-between items-center pagination-controls" data-status="${status}">
                        <button class="prev-btn bg-gray-700 px-3 py-1 rounded disabled:opacity-50">Previous</button>
                        <span class="page-info">Page 1 of 1</span>
                        <button class="next-btn bg-gray-700 px-3 py-1 rounded disabled:opacity-50">Next</button>
                    </div>
                </div>
            `;
        });

        const spiderHtml = `
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${spider.name} - ATP-OSM Sync</title>
    <link href="./style.css" rel="stylesheet">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen p-8">
    <div class="max-w-7xl mx-auto">
        <nav class="mb-8">
            <a href="index.html" class="text-blue-400 hover:underline">← Back to Index</a>
        </nav>
        <header class="mb-12">
            <h1 class="text-4xl font-extrabold mb-2">${spider.name}</h1>
            <p class="text-gray-400">Last updated: ${lastSync}</p>
        </header>

        ${sectionsHtml}
    </div>

    <script>
        const PAGE_SIZE = 50;
        document.querySelectorAll('.data-table').forEach(table => {
            const status = table.dataset.status;
            const rows = Array.from(table.querySelectorAll('tbody tr'));
            const controls = document.querySelector(\`.pagination-controls[data-status="\${status}"]\`);
            const pageInfo = controls.querySelector('.page-info');
            const prevBtn = controls.querySelector('.prev-btn');
            const nextBtn = controls.querySelector('.next-btn');

            let currentPage = 1;
            const totalPages = Math.ceil(rows.length / PAGE_SIZE);

            function update() {
                rows.forEach((row, i) => {
                    row.style.display = (i >= (currentPage-1)*PAGE_SIZE && i < currentPage*PAGE_SIZE) ? '' : 'none';
                });
                pageInfo.textContent = \`Page \${currentPage} of \${totalPages}\`;
                prevBtn.disabled = currentPage === 1;
                nextBtn.disabled = currentPage === totalPages || totalPages === 0;
            }

            prevBtn.onclick = () => { if(currentPage > 1) { currentPage--; update(); } };
            nextBtn.onclick = () => { if(currentPage < totalPages) { currentPage++; update(); } };

            update();
        });
    </script>
</body>
</html>
        `;
        fs.writeFileSync(path.join(outputDir, `${spider.name}.html`), spiderHtml);
    });

    // Generate Index Page
    const spiderRows = allSpiderResults.map(spider => {
        const issuesCount = spider.results.filter(r => r.status !== 'matching').length;
        const totalCount = spider.results.length;
        return `
            <tr class="border-b border-gray-700 hover:bg-gray-800">
                <td class="px-6 py-4">
                    <a href="${spider.name}.html" class="text-blue-400 hover:underline font-bold text-lg">${spider.name}</a>
                </td>
                <td class="px-6 py-4">
                    <span class="${issuesCount > 0 ? 'text-red-400' : 'text-green-400'} font-semibold">
                        ${issuesCount}
                    </span>
                    <span class="text-gray-500"> / ${totalCount}</span>
                </td>
                <td class="px-6 py-4 text-gray-400">${lastSync}</td>
            </tr>
        `;
    }).join('');

    const indexHtml = `
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ATP-OSM Sync Dashboard</title>
    <link href="./style.css" rel="stylesheet">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen p-8">
    <div class="max-w-5xl mx-auto">
        <header class="mb-12">
            <h1 class="text-5xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
                ATP-OSM Sync
            </h1>
            <p class="text-xl text-gray-400">Data synchronization between All The Places and OpenStreetMap</p>
        </header>

        <div class="bg-gray-900 rounded-xl shadow-2xl overflow-hidden border border-gray-800">
            <table class="min-w-full">
                <thead class="bg-gray-800 text-gray-400 text-left uppercase text-sm tracking-wider">
                    <tr>
                        <th class="px-6 py-4">Spider Name</th>
                        <th class="px-6 py-4">Issues / Total</th>
                        <th class="px-6 py-4">Last Sync</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-800">
                    ${spiderRows}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>
    `;
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
                results: results
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
