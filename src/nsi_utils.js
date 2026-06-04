import fs from 'fs';

const NSI_FILE = 'node_modules/name-suggestion-index/dist/json/nsi.json';

const nsiLookup = new Map();

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

            nsiLookup.set(item.id, {
                tags: effectiveTags,
                originalTags: item.tags,
            });
        }
    }
}

loadNsiData();

export function getNsiEffectiveTags(nsiId) {
    return nsiLookup.get(nsiId)?.tags || null;
}

export function getNsiIdExists(nsiId) {
    return nsiLookup.has(nsiId);
}

export function getNsiItem(nsiId) {
    return nsiLookup.get(nsiId) || null;
}
