import slugify from 'slugify';
import { countries as countriesList } from 'countries-list';
import { isAllowedSourceUri } from './utils.js';
import { areTagsEqual, formatPhone, getOverallStatus } from './tag_comparisons.js';

export async function processSpiderResults(spiderData, spiderMatches, runs, safeEdits = {}) {
    const { latestRun, spiderMaps, config: spider, isBrandSpider } = spiderData;
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
            itemStatus = !isBrandSpider ? 'notABrandSpider' : 'disallowedSourceUri';
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
                    if (expandedImportableTags.has(tag) || tag === 'opening_hours' || tag === 'website') {
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
                    status = 'duplicateRef';
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
                            status = 'addToOsm';
                        } else {
                            status = 'mismatch';
                        }
                    } else {
                        if (areTagsEqual(tag, osmTagValue, spiderValue, country)) {
                            status = 'matching';
                        } else {
                            // Check for updateOsm
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
                                    status = 'updateOsm';
                                }
                            } else {
                                status = 'mismatch';
                            }
                        }
                    }
                } else {
                    status = 'notMapped';
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

        if (isMapped || itemStatus === 'disallowedSourceUri' || itemStatus === 'notABrandSpider') {
            results.push({
                ...result,
                allAtpTags: result.matchCount > 1 || !isMapped ? filteredAtpTags : undefined,
            });
        } else {
            unmapped.push({
                ...result,
                allAtpTags: filteredAtpTags,
            });
        }

        // Collect safe edits
        if (osmId && (itemStatus === 'updateOsm' || itemStatus === 'addToOsm')) {
            const rawCountryCode = props['addr:country'];
            const countryCode = typeof rawCountryCode === 'string' ? rawCountryCode.toUpperCase() : null;
            const state = props['addr:state'];
            const osmType = osmId.startsWith('n') ? 'node' : osmId.startsWith('w') ? 'way' : 'relation';
            const osmNumericId = osmId.replace(/^[nwr]/, '');

            if (countryCode && /^[A-Z]{2}$/.test(countryCode)) {
                const countryInfo = countriesList[countryCode];
                if (countryInfo) {
                    const countryName = countryInfo.native;
                    const tagsToEdit = itemTags.filter(t => t.status === 'updateOsm' || t.status === 'addToOsm');

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
                            newValues,
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
                                    tags: [],
                                },
                                edits: [],
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
                const tagsToEdit = itemTags.filter(t => t.status === 'updateOsm' || t.status === 'addToOsm');
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
                        newValues,
                    };

                    if (!safeEdits[spider.name]) safeEdits[spider.name] = {};
                    const fileKey = 'countryless';
                    if (!safeEdits[spider.name][fileKey]) {
                        safeEdits[spider.name][fileKey] = {
                            metadata: {
                                spider: spider.name,
                                country: 'Countryless',
                                tags: [],
                            },
                            edits: [],
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
