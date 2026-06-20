import { URL } from 'url';
import {
    SLUGIFY_OPTIONS,
    STABILITY_THRESHOLD_RED,
    STABILITY_THRESHOLD_ORANGE,
    filterAtpTags,
    matchesCategories,
    getExpandedTags,
    getMissingDays,
    areAllDaysDefined,
    formatMissingDays,
    isValidIsoDate,
    splitSemicolonList,
    calculateStability,
} from './shared_utils.js';

export {
    SLUGIFY_OPTIONS,
    STABILITY_THRESHOLD_RED,
    STABILITY_THRESHOLD_ORANGE,
    filterAtpTags,
    matchesCategories,
    getExpandedTags,
    getMissingDays,
    areAllDaysDefined,
    formatMissingDays,
    isValidIsoDate,
    splitSemicolonList,
    calculateStability,
};

/**
 * Checks if a source URI is allowed based on a list of allowed hostnames.
 *
 * @param {string} sourceUri - The source URI to check.
 * @param {string[]} allowedList - An array of allowed hostnames.
 * @returns {boolean} True if the source URI is allowed, false otherwise.
 */
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
