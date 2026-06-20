import fs from 'fs';

const NSI_FILE = 'node_modules/name-suggestion-index/dist/json/nsi.json';

const NSI_LOOKUP = new Map();

/**
 * Loads Name Suggestion Index (NSI) data from the node_modules directory.
 * Populates a lookup map with effective tags for each NSI item.
 */
function loadNsiData() {
    if (!fs.existsSync(NSI_FILE)) {
        console.warn('NSI data not found at', NSI_FILE);
        return;
    }
    const data = JSON.parse(fs.readFileSync(NSI_FILE, 'utf8'));
    for (const categoryPath in data.nsi) {
        const category = data.nsi[categoryPath];
        const categoryPreserve = category.properties?.preserveTags || [];
        for (const item of category.items) {
            const itemPreserve = item.preserveTags || [];
            const mergedPreserve = [...new Set([...categoryPreserve, ...itemPreserve])];

            const effectiveTags = {};
            const preserveRegexes = mergedPreserve.map(p => new RegExp(p));
            for (const [tag, value] of Object.entries(item.tags)) {
                const isPreserved = preserveRegexes.some(re => re.test(tag));
                if (!isPreserved) {
                    effectiveTags[tag] = value;
                }
            }

            NSI_LOOKUP.set(item.id, {
                tags: effectiveTags,
                originalTags: item.tags,
            });
        }
    }
}

loadNsiData();

/**
 * Returns the effective tags for a given NSI ID.
 *
 * @param {string} nsiId - The NSI ID to look up.
 * @returns {Object|null} The effective tags object, or null if not found.
 */
export function getNsiEffectiveTags(nsiId) {
    return NSI_LOOKUP.get(nsiId)?.tags || null;
}

/**
 * Checks if a given NSI ID exists in the loaded data.
 *
 * @param {string} nsiId - The NSI ID to check.
 * @returns {boolean} True if the ID exists, false otherwise.
 */
export function getNsiIdExists(nsiId) {
    return NSI_LOOKUP.has(nsiId);
}

/**
 * Returns the complete NSI item entry for a given NSI ID.
 *
 * @param {string} nsiId - The NSI ID to look up.
 * @returns {Object|null} The NSI item entry, or null if not found.
 */
export function getNsiItem(nsiId) {
    return NSI_LOOKUP.get(nsiId) || null;
}
