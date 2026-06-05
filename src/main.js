if (process.env.NO_DEBUG === 'true') {
    console.debug = () => {};
}

import axios from 'axios';
import fs from 'fs';
import path from 'path';
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

                // Write separate JSON and GeoJSON files
                const outputDir = 'output';
                const spiderDir = path.join(outputDir, spiderName);
                if (!fs.existsSync(spiderDir)) {
                    fs.mkdirSync(spiderDir, { recursive: true });
                }

                fs.writeFileSync(path.join(spiderDir, `${spiderName}_unmapped.json`), JSON.stringify(unmapped));
                fs.writeFileSync(path.join(spiderDir, `${spiderName}_unmatched.json`), JSON.stringify(unmatched));

                // Generate unmapped GeoJSON for JOSM (including disallowed source uri and not a brand spider)
                const unmappedRefs = new Set([
                    ...unmapped.map(u => u.ref),
                    ...results
                        .filter(r => r.status === 'disallowed source uri' || r.status === 'not a brand spider')
                        .map(r => r.ref),
                ]);

                const unmappedGeoJson = {
                    type: 'FeatureCollection',
                    features: data.latestRun.features.filter(f => unmappedRefs.has(f.properties.ref)),
                };
                fs.writeFileSync(
                    path.join(spiderDir, `${spiderName}_unmapped.geojson`),
                    JSON.stringify(unmappedGeoJson)
                );

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
