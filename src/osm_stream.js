import axios from 'axios';
import fs from 'fs';
import { spawn } from 'child_process';
import readline from 'readline';
import { getNsiEffectiveTags } from './nsi_utils.js';
import { normaliseWebsite } from './tag_comparisons.js';
import { matchesCategories } from './shared_utils.js';

const decodeOpl = str => {
    // OPL format uses %HEX% encoding for characters.
    return str.replace(/%([0-9A-Fa-f]{1,6})%/g, (match, hex) => {
        return String.fromCodePoint(parseInt(hex, 16));
    });
};

/**
 * Parses an OPL format tags string into a JavaScript object.
 * Handles %HEX% decoding for keys and values.
 *
 * @param {string} tagsStr - The OPL tags string (e.g., 'Tkey=val,key2=val2').
 * @returns {Object} An object containing the parsed tags.
 */
export function parseOplTags(tagsStr) {
    const tags = {};
    if (!tagsStr || tagsStr === 'T') return tags;

    const parts = tagsStr.substring(1).split(',');
    for (const part of parts) {
        const eqIdx = part.indexOf('=');
        if (eqIdx !== -1) {
            const encodedKey = part.substring(0, eqIdx);
            const encodedVal = part.substring(eqIdx + 1);

            tags[decodeOpl(encodedKey)] = decodeOpl(encodedVal);
        }
    }
    return tags;
}

/**
 * Streams OSM data from a PBF file (via osmium) and matches it against ATP data.
 * Populates allMatches and allUnmatched maps.
 *
 * @param {string} url - The URL or path to the OSM PBF extract.
 * @param {Object} spiders - The spider configuration object.
 * @param {Map} atpLookup - The lookup map for ATP features.
 * @param {Map} wikidataToSpiders - Map of Wikidata IDs to spider names.
 * @param {Map} allMatches - Map to be populated with matched features per spider.
 * @param {Map} allUnmatched - Map to be populated with unmatched OSM features per spider.
 * @returns {Promise<void>} A promise that resolves when streaming and matching is complete.
 */
export async function streamOsmData(url, spiders, atpLookup, wikidataToSpiders, allMatches, allUnmatched) {
    const refKeyMap = new Map(); // refKey -> Set of spider names
    for (const [spiderName, spiderConfig] of Object.entries(spiders)) {
        const refKey = spiderConfig.ref_key || 'ref';
        if (!refKeyMap.has(refKey)) refKeyMap.set(refKey, new Set());
        refKeyMap.get(refKey).add(spiderName);
    }

    if (process.env.MOCK === 'true') {
        console.log('Using mock OSM data...');
        const mockMatches = JSON.parse(fs.readFileSync('mock_data/osm_matches.json', 'utf8'));
        const mockUnmatched = JSON.parse(fs.readFileSync('mock_data/osm_unmatched.json', 'utf8'));

        for (const entry of mockMatches) {
            const props = entry.tags;
            const brand = props.brand;
            const wikidata = props['brand:wikidata'];

            // Simplified matching for mock
            const country = props['addr:country'];
            for (const [refKeyName, spiderNames] of refKeyMap.entries()) {
                const osmRefValue = props[refKeyName];
                if (osmRefValue && country && /^[A-Z]{2}$/.test(country)) {
                    const matchingRef = refKeyName === 'branch' ? osmRefValue.toLowerCase() : osmRefValue;
                    const key = `ref|${brand}|${wikidata}|${refKeyName}|${matchingRef}|${country}`;
                    if (atpLookup.has(key)) {
                        for (const match of atpLookup.get(key)) {
                            if (!spiderNames.has(match.spiderName)) continue;
                            const spiderMatches = allMatches.get(match.spiderName);
                            if (!spiderMatches.has(match.atpRef)) {
                                spiderMatches.set(match.atpRef, []);
                            }
                            spiderMatches.get(match.atpRef).push(entry);
                        }
                    }
                }
            }
        }

        for (const entry of mockUnmatched) {
            const props = entry.tags;
            const wikidata = props['brand:wikidata'];
            if (wikidata && wikidataToSpiders.has(wikidata)) {
                for (const spiderName of wikidataToSpiders.get(wikidata)) {
                    if (!allUnmatched.has(spiderName)) allUnmatched.set(spiderName, new Map());
                    allUnmatched.get(spiderName).set(entry.id, entry);
                }
            }
        }
        return Promise.resolve();
    }

    console.log(`Streaming OSM data from ${url}...`);

    let response;
    try {
        response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
        });
    } catch (error) {
        throw new Error(`Failed to initiate OSM data stream from ${url}: ${error.message}`, { cause: error });
    }

    const filterArgs = ['tags-filter', '-', 'nwr/brand', 'nwr/brand:wikidata', 'nwr/website', 'nwr/contact:website'];
    for (const key of refKeyMap.keys()) {
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

    try {
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
                const normalisedWeb = normaliseWebsite(website);
                const key = `web|${brand}|${wikidata}|${normalisedWeb}`;
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
            const country = props['addr:country'];
            for (const [refKeyName, spiderNames] of refKeyMap.entries()) {
                const osmRefValue = props[refKeyName];
                if (osmRefValue && country && /^[A-Z]{2}$/.test(country)) {
                    const matchingRef = refKeyName === 'branch' ? osmRefValue.toLowerCase() : osmRefValue;
                    const key = `ref|${brand}|${wikidata}|${refKeyName}|${matchingRef}|${country}`;
                    if (atpLookup.has(key)) {
                        for (const match of atpLookup.get(key)) {
                            // Ensure we are matching the correct spider
                            if (!spiderNames.has(match.spiderName)) continue;

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

                    const spiderConfig = spiders[spiderName];
                    if (
                        spiderConfig &&
                        spiderConfig.showUnmatched &&
                        matchesCategories(props, spiderConfig.categories)
                    ) {
                        if (!allUnmatched.has(spiderName)) allUnmatched.set(spiderName, new Map());
                        allUnmatched.get(spiderName).set(id, entry);
                    }
                }
            }
        }
    } catch (error) {
        throw new Error(`Error during OSM data streaming: ${error.message}`, { cause: error });
    }

    return new Promise((resolve, reject) => {
        tagsFilter.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`osmium tags-filter exited with code ${code}`));
        });
        tagsFilter.on('error', reject);
    });
}
