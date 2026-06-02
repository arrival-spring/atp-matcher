import { URL } from 'url';

export function isAllowedSourceUri(sourceUri, allowedList) {
    if (!sourceUri || !allowedList || !Array.isArray(allowedList)) return false;
    try {
        const url = new URL(sourceUri);
        const hostname = url.hostname.toLowerCase();
        return allowedList.some(
            allowed => hostname === allowed.toLowerCase() || hostname.endsWith('.' + allowed.toLowerCase())
        );
    } catch {
        return false;
    }
}

export function matchesCategories(featureProps, categories) {
    if (!categories || !Array.isArray(categories) || categories.length === 0) return true;

    return categories.some(category => {
        return Object.entries(category).every(([key, value]) => {
            return featureProps[key] === value;
        });
    });
}
