import axios from 'axios';
import fs from 'fs';
import { spawn } from 'child_process';
import readline from 'readline';
import { getNsiEffectiveTags } from './nsi_utils.js';
import { normalizeWebsite } from './tag_comparisons.js';
import { matchesCategories } from './utils.js';

export function parseOplTags(tagsStr) {
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

export async function streamOsmData(url, spiders, atpLookup, wikidataToSpiders, allMatches, allUnmatched) {
    if (process.env.MOCK === 'true') {
        console.log('Using mock OSM data...');
        const mockMatches = JSON.parse(fs.readFileSync('mock_data/osm_matches.json', 'utf8'));
        const mockUnmatched = JSON.parse(fs.readFileSync('mock_data/osm_unmatched.json', 'utf8'));

        for (const entry of mockMatches) {
            const props = entry.tags;
            const brand = props.brand;
            const wikidata = props['brand:wikidata'];
            const website = props.website || props['contact:website'];

            // Simplified matching for mock
            for (const [spiderName, spiderConfig] of Object.entries(spiders)) {
                const refKeyName = spiderConfig.ref_key || 'ref';
                const osmRefValue = props[refKeyName];
                if (osmRefValue) {
                    const matchingRef = refKeyName === 'branch' ? osmRefValue.toLowerCase() : osmRefValue;
                    const key = `ref|${brand}|${wikidata}|${refKeyName}|${matchingRef}`;
                    if (atpLookup.has(key)) {
                        for (const match of atpLookup.get(key)) {
                            if (match.spiderName !== spiderName) continue;
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

    const refKeys = new Set(['ref']);
    for (const spiderConfig of Object.values(spiders)) {
        if (spiderConfig.ref_key) {
            refKeys.add(spiderConfig.ref_key);
        }
    }

    const filterArgs = ['tags-filter', '-', 'nwr/brand', 'nwr/brand:wikidata', 'nwr/website', 'nwr/contact:website'];
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
            for (const [spiderName, spiderConfig] of Object.entries(spiders)) {
                const refKeyName = spiderConfig.ref_key || 'ref';
                const osmRefValue = props[refKeyName];
                if (osmRefValue) {
                    const matchingRef = refKeyName === 'branch' ? osmRefValue.toLowerCase() : osmRefValue;
                    const key = `ref|${brand}|${wikidata}|${refKeyName}|${matchingRef}`;
                    if (atpLookup.has(key)) {
                        for (const match of atpLookup.get(key)) {
                            // Ensure we are matching the correct spider
                            if (match.spiderName !== spiderName) continue;

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
