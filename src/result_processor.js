import slugify from 'slugify';
import { countries as countriesList } from 'countries-list';
import { isAllowedSourceUri, areAllDaysDefined } from './utils.js';
import { areTagsEqual, formatPhone, getOverallStatus } from './tag_comparisons.js';

function isValidIsoDate(date) {
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export async function processSpiderResults(spiderData, spiderMatches, runs, safeEdits = {}, isAuto = false) {
    const { latestRun, spiderMaps, config: spider, isBrandSpider } = spiderData;
    console.log(`Processing spider results: ${spider.name}`);

    const results = [];
    const unmapped = [];
    const usedTags = new Set();
    const pendingEdits = [];
    const tagEditCounts = {}; // { tag: { add: 0, update: 0 } }
    let mappedCount = 0;

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
        const matchEntries = spiderMatches.get(matchingValue) || [];

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
                    const itemProps = spiderMaps[idx].get(matchingValue);
                    let val = itemProps?.[tag] || null;
                    if (tag === 'phone' && val) {
                        val = formatPhone(val, country);
                    }
                    return {
                        date: run.run_id.substring(0, 10),
                        value: val,
                        itemExists: !!itemProps,
                    };
                });

                const lastIdx = spiderData.runStatuses ? spiderData.runStatuses.lastIndexOf('ok') : history.length - 1;
                const isStable =
                    lastIdx > 0 &&
                    (spiderData.runStatuses ? spiderData.runStatuses[lastIdx - 1] === 'ok' : true) &&
                    history[lastIdx].value !== null &&
                    history[lastIdx - 1].value !== null &&
                    areTagsEqual(tag, history[lastIdx].value, history[lastIdx - 1].value, country) &&
                    areTagsEqual(tag, history[lastIdx].value, spiderValue, country);

                const nonNullValues = history.map(h => h.value).filter(v => v !== null);
                const countOfSpiderValue = nonNullValues.filter(v => areTagsEqual(tag, v, spiderValue, country)).length;
                const isNewValue = countOfSpiderValue === 1;

                if (matchEntries.length > 1) {
                    status = 'duplicateRef';
                } else if (matchEntries.length === 1) {
                    const osm = matchEntries[0];
                    osmId = osm.id;
                    let osmTagValue = osm.tags[tag] || null;
                    let osmCheckDate = osm.tags[`check_date:${tag}`] || null;
                    if (!isValidIsoDate(osmCheckDate)) {
                        osmCheckDate = null;
                    }

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
                        status = 'addToOsm';
                    } else if (areTagsEqual(tag, osmTagValue, spiderValue, country)) {
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
                        status = canUpdate ? 'updateOsm' : 'mismatch';
                    }

                    if (status === 'updateOsm' || status === 'addToOsm') {
                        let isMismatch = false;
                        if (tag === 'opening_hours' && status === 'updateOsm') {
                            if (osmTagValue.includes('PH') || !areAllDaysDefined(spiderValue)) {
                                isMismatch = true;
                            }
                        }

                        const proposedCheckDate = history.length >= 3 ? history[2].date : null;
                        if (!isMismatch && proposedCheckDate && osmCheckDate && proposedCheckDate <= osmCheckDate) {
                            isMismatch = true;
                        }

                        if (isMismatch) {
                            status = 'mismatch';
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
                    isNewValue,
                });
            }
            itemStatus = getOverallStatus(itemTags.map(t => t.status));
            if (itemStatus === 'matching' && matchEntries.length === 0) {
                itemStatus = 'notMapped';
            }
        }

        const filteredAtpTags = {};
        for (const [k, v] of Object.entries(props)) {
            if (!k.startsWith('@') && k !== 'nsi_id') {
                filteredAtpTags[k] = v;
            }
        }

        const allMatchesForRef = spiderMatches.get(matchingValue) || [];
        const isMapped = allMatchesForRef.length > 0;
        const matchCount = allMatchesForRef.length;

        if (isMapped) mappedCount++;

        if (matchCount > 1) {
            itemStatus = 'duplicateRef';
        }

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
                matches: result.matchCount > 1 ? allMatchesForRef : undefined,
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

            const tagsToEdit = itemTags.filter(
                t => (t.status === 'updateOsm' || t.status === 'addToOsm') && t.isStable
            );
            if (tagsToEdit.length > 0) {
                const originalValues = {};
                const newValues = {};
                tagsToEdit.forEach(t => {
                    originalValues[t.tag] = t.osmValue;
                    newValues[t.tag] = t.spiderValue;

                    if (!tagEditCounts[t.tag]) tagEditCounts[t.tag] = { add: 0, update: 0 };
                    if (t.status === 'addToOsm') {
                        tagEditCounts[t.tag].add++;
                    } else {
                        tagEditCounts[t.tag].update++;
                    }

                    const checkDateTag = `check_date:${t.tag}`;
                    const osm = matchEntries[0];
                    let existingCheckDate = osm.tags[checkDateTag] || null;
                    if (!isValidIsoDate(existingCheckDate)) {
                        existingCheckDate = null;
                    }

                    const shouldUpdateCheckDate =
                        (t.status === 'updateOsm' && t.tag === 'opening_hours') ||
                        ((t.status === 'updateOsm' || t.status === 'addToOsm') && existingCheckDate);

                    if (shouldUpdateCheckDate) {
                        const proposedCheckDate = t.history.length >= 3 ? t.history[2].date : null;
                        if (proposedCheckDate) {
                            originalValues[checkDateTag] = existingCheckDate;
                            newValues[checkDateTag] = proposedCheckDate;

                            if (!tagEditCounts[checkDateTag]) tagEditCounts[checkDateTag] = { add: 0, update: 0 };
                            if (existingCheckDate === null) {
                                tagEditCounts[checkDateTag].add++;
                            } else {
                                tagEditCounts[checkDateTag].update++;
                            }
                        }
                    }
                });

                const edit = {
                    type: osmType,
                    id: osmNumericId,
                    originalValues,
                    newValues,
                    countryCode,
                    state,
                    ref: matchingValue,
                };
                pendingEdits.push(edit);
            }
        }
    }

    const threshold = Math.max(5, Math.ceil(mappedCount * 0.1));
    const thresholdViolations = [];
    const brokenTags = {
        add: new Set(),
        update: new Set(),
    };
    for (const [tag, counts] of Object.entries(tagEditCounts)) {
        if (counts.add > threshold) {
            brokenTags.add.add(tag);
            thresholdViolations.push({ tag, count: counts.add, mappedCount, type: 'add' });
        }
        if (counts.update > threshold) {
            brokenTags.update.add(tag);
            thresholdViolations.push({ tag, count: counts.update, mappedCount, type: 'update' });
        }
    }

    for (const pending of pendingEdits) {
        const filteredOriginalValues = {};
        const filteredNewValues = {};
        const finalTags = [];

        for (const tag of Object.keys(pending.newValues)) {
            const isAdd = pending.originalValues[tag] === null;
            if (isAdd && brokenTags.add.has(tag)) continue;
            if (!isAdd && brokenTags.update.has(tag)) continue;

            // If it is a check_date, only include if its parent tag is also included
            if (tag.startsWith('check_date:')) {
                const parentTag = tag.split(':')[1];
                const parentIsAdd = pending.originalValues[parentTag] === null;
                if (parentIsAdd && brokenTags.add.has(parentTag)) continue;
                if (!parentIsAdd && brokenTags.update.has(parentTag)) continue;
            }

            filteredOriginalValues[tag] = pending.originalValues[tag];
            filteredNewValues[tag] = pending.newValues[tag];
            if (!tag.startsWith('check_date:')) {
                finalTags.push(tag);
            }
        }

        if (finalTags.length > 0) {
            if (isAuto) {
                const result = results.find(r => r.ref === pending.ref);
                if (result) {
                    finalTags.forEach(tag => {
                        const tagData = result.tags.find(t => t.tag === tag);
                        if (tagData) {
                            tagData.status = 'editMade';
                        }
                    });
                    result.status = getOverallStatus(result.tags.map(t => t.status));
                }
            }

            const { type, id, countryCode, state } = pending;
            const edit = {
                type,
                id,
                originalValues: filteredOriginalValues,
                newValues: filteredNewValues,
            };

            if (countryCode && /^[A-Z]{2}$/.test(countryCode)) {
                const countryInfo = countriesList[countryCode];
                if (countryInfo) {
                    const countryName = countryInfo.native;
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
                    finalTags.forEach(t => {
                        if (!currentFile.metadata.tags.includes(t)) {
                            currentFile.metadata.tags.push(t);
                        }
                    });
                } else {
                    // Fallback for unknown country code but valid format
                    addToCountryless(safeEdits, spider.name, edit, finalTags);
                }
            } else {
                if (countryCode) {
                    console.warn(`Spider ${spider.name} has invalid country code: ${countryCode} for ref ${pending.ref}`);
                }
                addToCountryless(safeEdits, spider.name, edit, finalTags);
            }
        }
    }

    return { results, unmapped, usedTags: Array.from(usedTags).sort(), thresholdViolations };
}

function addToCountryless(safeEdits, spiderName, edit, finalTags) {
    if (!safeEdits[spiderName]) safeEdits[spiderName] = {};
    const fileKey = 'countryless';
    if (!safeEdits[spiderName][fileKey]) {
        safeEdits[spiderName][fileKey] = {
            metadata: {
                spider: spiderName,
                country: 'Countryless',
                tags: [],
            },
            edits: [],
        };
    }
    const currentFile = safeEdits[spiderName][fileKey];
    currentFile.edits.push(edit);
    finalTags.forEach(t => {
        if (!currentFile.metadata.tags.includes(t)) {
            currentFile.metadata.tags.push(t);
        }
    });
}
