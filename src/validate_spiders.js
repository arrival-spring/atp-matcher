import fs from 'fs';
import { execSync } from 'child_process';
import axios from 'axios';
import './axios_config.js';
import { getDomain } from 'tldts';
import * as prettier from 'prettier';
import { isAllowedSourceUri } from './utils.js';
import { matchesCategories, getExpandedTags } from './shared_utils.js';
import { getNsiEffectiveTags } from './nsi_utils.js';

const CONFIG_FILE = 'config.json';
const SPIDERS_AUTO_FILE = 'spiders_auto.json';
const SPIDERS_PREVIEW_FILE = 'spiders_preview.json';

/**
 * Cleans and sorts a spider configuration JSON file.
 * Ensures alphabetical ordering, consistent property structure and removes redundant tags.
 *
 * @param {string} filepath - Path to the JSON file to clean.
 * @param {boolean} [shouldWrite=false] - Whether to write the cleaned JSON back to the file.
 * @returns {Promise<Object>} An object containing the cleaned spiders and change flags.
 */
async function cleanAndSort(filepath, shouldWrite = false) {
    if (!fs.existsSync(filepath)) return { spiders: {}, reordered: false, autoRemovedTags: false };
    const content = fs.readFileSync(filepath, 'utf8');
    const spiders = JSON.parse(content);

    let autoRemovedTags = false;
    const cleanedSpiders = {};

    const sortedNames = Object.keys(spiders).sort();

    for (const name of sortedNames) {
        const s = spiders[name];
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
        cleanedSpiders[name] = cleanedSpider;
    }

    const isSortedAndCleaned = JSON.stringify(spiders) === JSON.stringify(cleanedSpiders);

    let reordered = false;
    if (!isSortedAndCleaned || autoRemovedTags) {
        if (shouldWrite) {
            let json = '{\n';
            const keys = Object.keys(cleanedSpiders).sort();
            keys.forEach((name, i) => {
                const spider = cleanedSpiders[name];
                json += `    "${name}": {\n`;
                const propKeys = Object.keys(spider);
                propKeys.forEach((prop, j) => {
                    json += `        "${prop}": ${JSON.stringify(spider[prop])}${j < propKeys.length - 1 ? ',' : ''}\n`;
                });
                json += `    }${i < keys.length - 1 ? ',' : ''}\n`;
            });
            json += '}';

            const prettierConfig = await prettier.resolveConfig(filepath);
            const formatted = await prettier.format(json, {
                ...prettierConfig,
                filepath: filepath,
                printWidth: 1000,
            });
            fs.writeFileSync(filepath, formatted);
        }
        reordered = !isSortedAndCleaned;
    }

    return { spiders: cleanedSpiders, reordered, autoRemovedTags };
}

/**
 * Retrieves the base configuration of spiders from the origin/main branch.
 *
 * @param {string} filepath - Path to the spider configuration file.
 * @returns {Object} The spider configuration object from main branch.
 */
function getBaseSpiders(filepath) {
    try {
        const content = execSync(`git show origin/main:${filepath}`, { encoding: 'utf8' });
        return JSON.parse(content);
    } catch {
        return {};
    }
}

/**
 * Main validation function that checks for consistency, rules and changes across all spiders.
 * Automatically moves spiders from auto to preview if rules are violated.
 * Generates PR comments with validation results.
 *
 * @param {string} [accumulatedComments=''] - Existing comments to include in the output.
 * @returns {Promise<void>}
 */
async function validate(accumulatedComments = '') {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const shouldFix = process.argv.includes('--fix');

    const autoData = await cleanAndSort(SPIDERS_AUTO_FILE, shouldFix);
    const previewData = await cleanAndSort(SPIDERS_PREVIEW_FILE, shouldFix);

    const spidersAuto = autoData.spiders;
    const spidersPreview = previewData.spiders;

    const autoNames = Object.keys(spidersAuto);
    const previewNames = Object.keys(spidersPreview);

    const duplicateNames = autoNames.filter(name => previewNames.includes(name));
    if (duplicateNames.length > 0) {
        outputComment(
            `Error: Duplicate spider names found across both files: ${[...new Set(duplicateNames)].join(', ')}`
        );
        process.exit(1);
    }

    const baseAuto = getBaseSpiders(SPIDERS_AUTO_FILE);
    const basePreview = getBaseSpiders(SPIDERS_PREVIEW_FILE);

    let infoComments = accumulatedComments;

    const addedToAuto = [];
    const modifiedInAuto = [];
    const addedToPreview = [];
    const modifiedInPreview = [];
    const removedFromPreviewNames = new Set();

    // Check Auto changes
    for (const [name, s] of Object.entries(spidersAuto)) {
        const base = baseAuto[name];
        if (!base) addedToAuto.push({ name, ...s });
        else if (JSON.stringify(s) !== JSON.stringify(base)) modifiedInAuto.push({ name, ...s });
    }

    // Check Preview changes
    for (const [name, s] of Object.entries(spidersPreview)) {
        const base = basePreview[name];
        if (!base) addedToPreview.push({ name, ...s });
        else if (JSON.stringify(s) !== JSON.stringify(base)) modifiedInPreview.push({ name, ...s });
    }

    // Check Preview removals (for moves)
    for (const name of Object.keys(basePreview)) {
        if (!spidersPreview[name]) {
            removedFromPreviewNames.add(name);
        }
    }

    // Re-identify changes for validation and reporting
    const finalAddedToAuto = [];
    const finalModifiedInAuto = [];
    const finalAddedToPreview = [];
    const finalModifiedInPreview = [];

    for (const [name, s] of Object.entries(spidersAuto)) {
        const base = baseAuto[name];
        if (!base) finalAddedToAuto.push({ name, ...s });
        else if (JSON.stringify(s) !== JSON.stringify(base)) finalModifiedInAuto.push({ name, ...s });
    }
    for (const [name, s] of Object.entries(spidersPreview)) {
        const base = basePreview[name];
        if (!base) finalAddedToPreview.push({ name, ...s });
        else if (JSON.stringify(s) !== JSON.stringify(base)) finalModifiedInPreview.push({ name, ...s });
    }

    const allChanges = [
        ...finalAddedToAuto.map(s => ({ spider: s, type: 'added to auto', isAuto: true })),
        ...finalModifiedInAuto.map(s => ({ spider: s, type: 'modified in auto', isAuto: true })),
        ...finalAddedToPreview.map(s => ({ spider: s, type: 'added to preview', isAuto: false })),
        ...finalModifiedInPreview.map(s => ({ spider: s, type: 'modified in preview', isAuto: false })),
    ];

    if (allChanges.length === 0) {
        if (infoComments) outputComment(infoComments);
        return;
    }

    const errors = [];

    // Rule: Max 1 spider change for auto.
    const autoChangesCount = finalAddedToAuto.length + finalModifiedInAuto.length;
    const tooManyAuto = autoChangesCount > 1;
    if (tooManyAuto) {
        errors.push(`Error: Only one spider should be added or modified in auto per PR. Found: ${autoChangesCount}`);
    }

    // Rule: Do not allow spiders to be added directly to auto. They must be moved from preview.
    const directToAuto = finalAddedToAuto.filter(s => !removedFromPreviewNames.has(s.name));
    if (directToAuto.length > 0) {
        directToAuto.forEach(s => {
            errors.push(
                `Error: Spider \`${s.name}\` was added directly to auto. Spiders must be added to preview first and undergo community review before being moved to auto.`
            );
        });
    }

    // Rule: If added to auto, it must be removed from preview.
    const stillInPreview = finalAddedToAuto.filter(s => spidersPreview[s.name]);
    if (stillInPreview.length > 0) {
        stillInPreview.forEach(s => {
            errors.push(
                `Error: Spider \`${s.name}\` was added to auto but is still present in \`${SPIDERS_PREVIEW_FILE}\`. Please remove it from the preview file.`
            );
        });
    }

    // Rule: Max 5 spider changes for preview.
    const previewChangesCount = finalAddedToPreview.length + finalModifiedInPreview.length;
    const tooManyPreview = previewChangesCount > 5;
    if (tooManyPreview) {
        errors.push(
            `Error: Up to five spiders can be added or modified in preview per PR. Found: ${previewChangesCount}`
        );
    }

    const tooManySpiders = tooManyAuto || tooManyPreview;

    // Rule: Ensure exact same properties when moving from preview to auto.
    for (const s of finalAddedToAuto) {
        const base = basePreview[s.name];
        if (base) {
            const { name: _name, ...rest } = s;
            if (JSON.stringify(rest) !== JSON.stringify(base)) {
                errors.push(
                    `Error: Spider \`${s.name}\` was modified while being moved to auto. It must retain the exact same properties.`
                );
            }
            if (base.rejected) {
                errors.push(
                    `Error: Spider \`${s.name}\` cannot be moved to auto because it is marked as rejected in the base branch.`
                );
            }
        }
    }

    // Rule: 'rejected' property only allowed in preview
    for (const [name, s] of Object.entries(spidersAuto)) {
        if (s.rejected) {
            errors.push(`Error: Spider \`${name}\` in auto cannot have a \`rejected\` property.`);
        }
    }

    let combinedComment = infoComments;
    let hasGlobalErrors = errors.length > 0;

    const validationResults = [];
    if (!tooManySpiders) {
        for (const change of allChanges) {
            const result = await validateSpider(change.spider, change.type, config);
            validationResults.push({ ...change, ...result });
            if (result.hasErrors) hasGlobalErrors = true;
        }
    }

    let addedToAutoInThisPr = false;
    let addedToPreviewInThisPr = false;

    if (tooManySpiders) {
        for (const change of allChanges) {
            combinedComment += `### Spider: ${change.spider.name} (${change.type})\n\n`;
        }
    } else {
        for (const res of validationResults) {
            combinedComment += res.comment;
            if (!hasGlobalErrors) {
                if (res.isAuto && res.type === 'added to auto') {
                    combinedComment += `\n> ℹ️ **Waiting Period:** This spider has been moved to auto. There will be a waiting period of at least two weeks for community feedback before it can be merged.\n\n`;
                    addedToAutoInThisPr = true;
                }
                if (!res.isAuto && res.type === 'added to preview') {
                    addedToPreviewInThisPr = true;
                }
            }
        }
    }

    if (
        !hasGlobalErrors &&
        (addedToAutoInThisPr || addedToPreviewInThisPr) &&
        process.env.GITHUB_TOKEN &&
        process.env.PR_NUMBER
    ) {
        try {
            const labels = [];
            if (addedToAutoInThisPr) labels.push('auto-request');
            if (addedToPreviewInThisPr) labels.push('preview-request');

            await axios.post(
                `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues/${process.env.PR_NUMBER}/labels`,
                { labels },
                {
                    headers: {
                        Authorization: `token ${process.env.GITHUB_TOKEN}`,
                        Accept: 'application/vnd.github.v3+json',
                    },
                }
            );
            console.log(`Added labels to PR: ${labels.join(', ')}`);
        } catch (error) {
            console.error(`Failed to add labels: ${error.message}`);
        }
    }

    if (errors.length > 0) {
        combinedComment += `### ❌ Global Validation Errors\n`;
        errors.forEach(e => (combinedComment += `- ${e}\n`));
    }

    outputComment(combinedComment);
    if (hasGlobalErrors) process.exit(1);
    process.exit(0);
}

/**
 * Validates a single spider configuration by checking its latest ATP data.
 * Verifies categories, disallowed tags, brand lineage and NSI tag overlap.
 *
 * @param {Object} spider - The spider configuration object.
 * @param {string} type - The type of change (e.g., 'added to auto').
 * @param {Object} config - The global application configuration.
 * @returns {Promise<Object>} An object containing the validation comment and error status.
 */
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
        const expandedImportableTags = getExpandedTags(spider.importableTags, data.features);

        const tagsToTrack = [...new Set([...expandedImportableTags, 'opening_hours', 'website'])];
        tagsToTrack.forEach(tag => {
            tagStats[tag] = { count: 0, unique: new Set() };
        });

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
                    if (typeof cat !== 'object' || cat === null || Array.isArray(cat))
                        errors.push(`Error: \`categories[${idx}]\` must be a dictionary.`);
                    else if (Object.keys(cat).length !== 1)
                        errors.push(`Error: \`categories[${idx}]\` must have exactly one key-value pair.`);
                });
            }
        }

        if (
            Object.prototype.hasOwnProperty.call(spider, 'showUnmatched') &&
            typeof spider.showUnmatched !== 'boolean'
        ) {
            errors.push('Error: `showUnmatched` must be a boolean.');
        }

        const lineage = data.dataset_attributes?.['spider:lineage'];
        if (lineage !== 'S_ATP_BRANDS')
            errors.push(`Error: Not a brand spider. Lineage: \`${lineage || 'not found'}\``);

        if (nsiOverlapTags.size > 0)
            errors.push(`Error: Tags provided by NSI: ${Array.from(nsiOverlapTags).join(', ')}`);

        if (errors.length > 0) {
            comment += `#### ❌ Validation Failed\n`;
            errors.forEach(e => (comment += `- ${e}\n`));
            comment += `\n`;
        }

        comment += `**Total features:** ${totalFeatures}\n\n`;
        comment += `#### Importable Tags\n`;
        tagsToTrack
            .filter(tag => (tag === 'opening_hours' || tag === 'website' ? tagStats[tag].count > 0 : true))
            .sort()
            .forEach(tag => {
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
        const msg =
            error.response && error.response.status === 404
                ? `Error: Spider \`${spiderName}\` not found in the latest ATP run.`
                : `Error fetching spider data for \`${spiderName}\`: ${error.message}`;
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
