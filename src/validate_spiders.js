import fs from 'fs';
import { execSync } from 'child_process';
import axios from 'axios';
import './axios_config.js';
import { getDomain } from 'tldts';
import * as prettier from 'prettier';
import { isAllowedSourceUri, matchesCategories } from './utils.js';
import { getNsiEffectiveTags } from './nsi_utils.js';

const CONFIG_FILE = 'config.json';
const SPIDERS_AUTO_FILE = 'spiders_auto.json';
const SPIDERS_PREVIEW_FILE = 'spiders_preview.json';

async function cleanAndSort(filepath) {
    if (!fs.existsSync(filepath)) return { spiders: [], reordered: false, autoRemovedTags: false };
    const content = fs.readFileSync(filepath, 'utf8');
    const spiders = JSON.parse(content);

    let autoRemovedTags = false;
    const cleanedSpiders = spiders.map(s => {
        const originalTags = s.importableTags ? [...s.importableTags] : [];
        const filteredTags = originalTags.filter(tag => tag !== 'opening_hours' && tag !== 'website');
        if (originalTags.length !== filteredTags.length) {
            autoRemovedTags = true;
        }
        const cleanedSpider = {
            ...s,
            source_uri: [...s.source_uri].sort(),
        };
        if (filteredTags.length > 0) {
            cleanedSpider.importableTags = filteredTags.sort();
        } else {
            delete cleanedSpider.importableTags;
        }
        return cleanedSpider;
    });

    const sortedSpiders = [...cleanedSpiders].sort((a, b) => a.name.localeCompare(b.name));
    const isSorted = JSON.stringify(cleanedSpiders) === JSON.stringify(sortedSpiders);

    let reordered = false;
    if (!isSorted || autoRemovedTags) {
        const prettierConfig = await prettier.resolveConfig(filepath);
        const formatted = await prettier.format(JSON.stringify(sortedSpiders), {
            ...prettierConfig,
            filepath: filepath,
        });
        fs.writeFileSync(filepath, formatted);
        reordered = !isSorted;
    }

    return { spiders: sortedSpiders, reordered, autoRemovedTags };
}

function getBaseSpiders(filepath) {
    try {
        const content = execSync(`git show origin/main:${filepath}`, { encoding: 'utf8' });
        return JSON.parse(content);
    } catch {
        return [];
    }
}

async function validate(accumulatedComments = '') {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

    const autoData = await cleanAndSort(SPIDERS_AUTO_FILE);
    const previewData = await cleanAndSort(SPIDERS_PREVIEW_FILE);

    const spidersAuto = autoData.spiders;
    const spidersPreview = previewData.spiders;

    const allSpiderNames = [...spidersAuto.map(s => s.name), ...spidersPreview.map(s => s.name)];
    const duplicateNames = allSpiderNames.filter((name, index) => allSpiderNames.indexOf(name) !== index);
    if (duplicateNames.length > 0) {
        outputComment(`Error: Duplicate spider names found across both files: ${[...new Set(duplicateNames)].join(', ')}`);
        process.exit(1);
    }

    const baseAuto = getBaseSpiders(SPIDERS_AUTO_FILE);
    const basePreview = getBaseSpiders(SPIDERS_PREVIEW_FILE);

    const baseAutoMap = new Map(baseAuto.map(s => [s.name, s]));
    const basePreviewMap = new Map(basePreview.map(s => [s.name, s]));

    let infoComments = accumulatedComments;
    if (autoData.reordered || previewData.reordered) {
        const msg = '> ℹ️ **Spiders were not in alphabetical order.** I have reordered them and committed the change.\n\n';
        if (!infoComments.includes(msg)) infoComments += msg;
    }
    if (autoData.autoRemovedTags || previewData.autoRemovedTags) {
        const msg = '> ℹ️ **`opening_hours` and `website` are now automatically included.** I have removed them from `importableTags` and committed the change.\n\n';
        if (!infoComments.includes(msg)) infoComments += msg;
    }

    const addedToAuto = [];
    const modifiedInAuto = [];
    const addedToPreview = [];
    const modifiedInPreview = [];
    const removedFromPreviewNames = new Set();

    // Check Auto changes
    for (const s of spidersAuto) {
        const base = baseAutoMap.get(s.name);
        if (!base) addedToAuto.push(s);
        else if (JSON.stringify(s) !== JSON.stringify(base)) modifiedInAuto.push(s);
    }

    // Check Preview changes
    for (const s of spidersPreview) {
        const base = basePreviewMap.get(s.name);
        if (!base) addedToPreview.push(s);
        else if (JSON.stringify(s) !== JSON.stringify(base)) modifiedInPreview.push(s);
    }

    // Check Preview removals (for moves)
    for (const s of basePreview) {
        if (!spidersPreview.some(curr => curr.name === s.name)) {
            removedFromPreviewNames.add(s.name);
        }
    }

    let filesChanged = false;
    let autoMoveComment = '';

    // Rule: Do not allow spiders to be added directly to auto. Move to preview.
    const directToAuto = addedToAuto.filter(s => !removedFromPreviewNames.has(s.name));
    if (directToAuto.length > 0) {
        for (const s of directToAuto) {
            // Remove from auto
            const idx = spidersAuto.findIndex(curr => curr.name === s.name);
            spidersAuto.splice(idx, 1);
            // Add to preview if not already there
            if (!spidersPreview.some(curr => curr.name === s.name)) {
                spidersPreview.push(s);
            }
            autoMoveComment += `> ℹ️ Spider \`${s.name}\` was added directly to auto. I have moved it to preview instead.\n\n`;
            filesChanged = true;
        }
    }

    // Rule: If added to auto that is in preview and not removed from preview, remove from preview.
    const moveWithoutRemoval = addedToAuto.filter(s => removedFromPreviewNames.has(s.name) === false && spidersPreview.some(curr => curr.name === s.name));
    // Actually, any spider in addedToAuto that is STILL in spidersPreview should be removed from preview.
    const stillInPreview = addedToAuto.filter(s => spidersPreview.some(curr => curr.name === s.name));
    if (stillInPreview.length > 0) {
        for (const s of stillInPreview) {
            const idx = spidersPreview.findIndex(curr => curr.name === s.name);
            spidersPreview.splice(idx, 1);
            autoMoveComment += `> ℹ️ Spider \`${s.name}\` was added to auto but was still in preview. I have removed it from preview.\n\n`;
            filesChanged = true;
        }
    }

    if (filesChanged) {
        spidersAuto.sort((a, b) => a.name.localeCompare(b.name));
        spidersPreview.sort((a, b) => a.name.localeCompare(b.name));
        const prettierConfigAuto = await prettier.resolveConfig(SPIDERS_AUTO_FILE);
        fs.writeFileSync(SPIDERS_AUTO_FILE, await prettier.format(JSON.stringify(spidersAuto), { ...prettierConfigAuto, filepath: SPIDERS_AUTO_FILE }));
        const prettierConfigPreview = await prettier.resolveConfig(SPIDERS_PREVIEW_FILE);
        fs.writeFileSync(SPIDERS_PREVIEW_FILE, await prettier.format(JSON.stringify(spidersPreview), { ...prettierConfigPreview, filepath: SPIDERS_PREVIEW_FILE }));

        // Re-evaluate changes after automatic move, preserving comments
        return validate(infoComments + autoMoveComment);
    }

    // Re-identify changes for validation and reporting
    const finalAddedToAuto = [];
    const finalModifiedInAuto = [];
    const finalAddedToPreview = [];
    const finalModifiedInPreview = [];

    for (const s of spidersAuto) {
        const base = baseAutoMap.get(s.name);
        if (!base) finalAddedToAuto.push(s);
        else if (JSON.stringify(s) !== JSON.stringify(base)) finalModifiedInAuto.push(s);
    }
    for (const s of spidersPreview) {
        const base = basePreviewMap.get(s.name);
        if (!base) finalAddedToPreview.push(s);
        else if (JSON.stringify(s) !== JSON.stringify(base)) finalModifiedInPreview.push(s);
    }

    const allChanges = [
        ...finalAddedToAuto.map(s => ({ spider: s, type: 'added to auto', isAuto: true })),
        ...finalModifiedInAuto.map(s => ({ spider: s, type: 'modified in auto', isAuto: true })),
        ...finalAddedToPreview.map(s => ({ spider: s, type: 'added to preview', isAuto: false })),
        ...finalModifiedInPreview.map(s => ({ spider: s, type: 'modified in preview', isAuto: false })),
    ];

    if (allChanges.length === 0) {
        if (infoComments || autoMoveComment) outputComment(infoComments + autoMoveComment);
        return;
    }

    const errors = [];

    // Rule: Max 1 spider change for auto.
    const autoChangesCount = finalAddedToAuto.length + finalModifiedInAuto.length;
    if (autoChangesCount > 1) {
        errors.push(`Error: Only one spider should be added or modified in auto per PR. Found: ${autoChangesCount}`);
    }

    // Rule: Max 5 spider changes for preview.
    const previewChangesCount = finalAddedToPreview.length + finalModifiedInPreview.length;
    if (previewChangesCount > 5) {
        errors.push(`Error: Up to five spiders can be added or modified in preview per PR. Found: ${previewChangesCount}`);
    }

    // Rule: Ensure exact same properties when moving from preview to auto.
    for (const s of finalAddedToAuto) {
        const base = basePreviewMap.get(s.name);
        if (base) {
            if (JSON.stringify(s) !== JSON.stringify(base)) {
                errors.push(`Error: Spider \`${s.name}\` was modified while being moved to auto. It must retain the exact same properties.`);
            }
            if (base.rejected) {
                errors.push(`Error: Spider \`${s.name}\` cannot be moved to auto because it is marked as rejected in the base branch.`);
            }
        }
    }

    // Rule: 'rejected' property only allowed in preview
    for (const s of spidersAuto) {
        if (s.rejected) {
            errors.push(`Error: Spider \`${s.name}\` in auto cannot have a \`rejected\` property.`);
        }
    }

    let combinedComment = infoComments + autoMoveComment;
    let hasGlobalErrors = errors.length > 0;

    for (const change of allChanges) {
        const { spider, type, isAuto } = change;
        const result = await validateSpider(spider, type, config);
        combinedComment += result.comment;
        if (result.hasErrors) hasGlobalErrors = true;

        if (isAuto && type === 'added to auto' && !result.hasErrors) {
            combinedComment += `\n> ℹ️ **Waiting Period:** This spider has been moved to auto. There will be a waiting period of at least two weeks for community feedback before it can be merged.\n\n`;
        }
    }

    if (errors.length > 0) {
        combinedComment += `### ❌ Global Validation Errors\n`;
        errors.forEach(e => combinedComment += `- ${e}\n`);
    }

    outputComment(combinedComment);
    if (hasGlobalErrors) process.exit(1);
    process.exit(0);
}

async function validateSpider(spider, type, config) {
    const spiderName = spider.name;
    const url = `https://data.alltheplaces.xyz/runs/latest/output/${spiderName}.geojson`;
    let comment = `### Spider Validation: ${spiderName} (${type})\n\n`;
    const errors = [];

    try {
        const response = await axios.get(url);
        const data = response.data;

        if (!data || !data.features) {
            return { comment: comment + `Error: Invalid GeoJSON data for spider ${spiderName}.\n\n`, hasErrors: true };
        }

        data.features = data.features.filter(f => {
            if ('end_date' in f.properties) return false;
            if (!matchesCategories(f.properties, spider.categories)) return false;
            return true;
        });

        const totalFeatures = data.features.length;
        const tagStats = {};
        const nsiOverlapTags = new Set();
        const expandedImportableTags = new Set();
        const wildcards = (spider.importableTags || []).filter(t => t.endsWith(':*')).map(t => t.slice(0, -1));
        const staticTags = (spider.importableTags || []).filter(t => !t.endsWith(':*'));
        staticTags.forEach(t => expandedImportableTags.add(t));

        if (wildcards.length > 0) {
            data.features.forEach(f => {
                for (const key of Object.keys(f.properties)) {
                    for (const wildcard of wildcards) {
                        if (key.startsWith(wildcard)) expandedImportableTags.add(key);
                    }
                }
            });
        }

        const tagsToTrack = [...new Set([...expandedImportableTags, 'opening_hours', 'website'])];
        tagsToTrack.forEach(tag => { tagStats[tag] = { count: 0, unique: new Set() }; });

        const domainStats = {};
        data.features.forEach(f => {
            const props = f.properties;
            if (props.nsi_id) {
                const nsiTags = getNsiEffectiveTags(props.nsi_id);
                if (nsiTags) {
                    for (const tag of Object.keys(nsiTags)) {
                        if (expandedImportableTags.has(tag)) nsiOverlapTags.add(tag);
                    }
                }
            }
            tagsToTrack.forEach(tag => {
                if (props[tag]) {
                    tagStats[tag].count++;
                    tagStats[tag].unique.add(props[tag]);
                }
            });
            const sourceUri = props['@source_uri'];
            if (sourceUri) {
                const domain = getDomain(sourceUri) || 'invalid';
                if (!domainStats[domain]) {
                    domainStats[domain] = { count: 0, allowed: isAllowedSourceUri(sourceUri, spider.source_uri) };
                }
                domainStats[domain].count++;
            }
        });

        // Validation checks
        const disallowedTags = (spider.importableTags || []).filter(tag => {
            if (tag.endsWith(':*')) {
                const prefix = tag.slice(0, -1);
                return !config.allowedImportableTags.some(allowed => allowed.startsWith(prefix));
            }
            return !config.allowedImportableTags.includes(tag);
        });
        if (disallowedTags.length > 0) errors.push(`Error: Disallowed tags: ${disallowedTags.join(', ')}`);

        if (spider.categories) {
            if (!Array.isArray(spider.categories)) errors.push('Error: `categories` must be an array.');
            else {
                spider.categories.forEach((cat, idx) => {
                    if (typeof cat !== 'object' || cat === null || Array.isArray(cat)) errors.push(`Error: \`categories[${idx}]\` must be a dictionary.`);
                    else if (Object.keys(cat).length !== 1) errors.push(`Error: \`categories[${idx}]\` must have exactly one key-value pair.`);
                });
            }
        }

        if (Object.prototype.hasOwnProperty.call(spider, 'showUnmatched') && typeof spider.showUnmatched !== 'boolean') {
            errors.push('Error: `showUnmatched` must be a boolean.');
        }

        const lineage = data.dataset_attributes?.['spider:lineage'];
        if (lineage !== 'S_ATP_BRANDS') errors.push(`Error: Not a brand spider. Lineage: \`${lineage || 'not found'}\``);

        if (nsiOverlapTags.size > 0) errors.push(`Error: Tags provided by NSI: ${Array.from(nsiOverlapTags).join(', ')}`);

        if (errors.length > 0) {
            comment += `#### ❌ Validation Failed\n`;
            errors.forEach(e => comment += `- ${e}\n`);
            comment += `\n`;
        }

        comment += `**Total features:** ${totalFeatures}\n\n`;
        comment += `#### Importable Tags\n`;
        tagsToTrack.filter(tag => (tag === 'opening_hours' || tag === 'website') ? tagStats[tag].count > 0 : true).sort().forEach(tag => {
            const isAllowed = config.allowedImportableTags.includes(tag);
            const count = tagStats[tag].count;
            const uniqueCount = tagStats[tag].unique.size;
            const percent = totalFeatures > 0 ? ((count / totalFeatures) * 100).toFixed(1) : 0;
            const uniquePercent = count > 0 ? ((uniqueCount / count) * 100).toFixed(1) : 0;
            comment += `- \`${tag}\`: ${count} (${percent}%) | Unique: ${uniqueCount}/${count} (${uniquePercent}%)${isAllowed ? '' : ' ❌ **(Disallowed Tag)**'}\n`;
        });
        comment += `\n#### Source URIs\n`;
        Object.entries(domainStats).forEach(([domain, stats]) => {
            comment += `- \`${domain}\`: ${stats.count} (${stats.allowed ? '✅ Allowed' : '❌ Disallowed'})\n`;
        });
        if (Object.keys(domainStats).length === 0) comment += `No \`@source_uri\` found.\n`;
        comment += `\n`;

        return { comment, hasErrors: errors.length > 0 };
    } catch (error) {
        const msg = error.response && error.response.status === 404 ? `Error: Spider \`${spiderName}\` not found in the latest ATP run.` : `Error fetching spider data for \`${spiderName}\`: ${error.message}`;
        return { comment: comment + msg + '\n\n', hasErrors: true };
    }
}

function outputComment(message) {
    console.log('--- PR COMMENT START ---');
    console.log(message);
    console.log('--- PR COMMENT END ---');
    fs.writeFileSync('pr_comment.md', message);
}

validate().catch(err => {
    console.error(err);
    process.exit(1);
});
