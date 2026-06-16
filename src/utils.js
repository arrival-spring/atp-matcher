import { URL } from 'url';

/**
 * Common options for slugify to ensure consistent slugs across the application.
 */
export const SLUGIFY_OPTIONS = { lower: true, remove: /[*+~.()'"!:@]/g };

/**
 * Threshold for red stability status (discrepancy > 10%).
 */
export const STABILITY_THRESHOLD_RED = 0.1;

/**
 * Threshold for orange stability status (discrepancy > 5%).
 */
export const STABILITY_THRESHOLD_ORANGE = 0.05;

/**
 * Filters ATP properties from a feature properties object.
 * Removes keys starting with '@' and the 'nsi_id' key.
 *
 * @param {Object} props - The feature properties object.
 * @returns {Object} A new object with filtered properties.
 */
export function filterAtpTags(props) {
    const filtered = {};
    if (!props) return filtered;
    for (const [k, v] of Object.entries(props)) {
        if (!k.startsWith('@') && k !== 'nsi_id') {
            filtered[k] = v;
        }
    }
    return filtered;
}

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

/**
 * Checks if feature properties match a list of category requirements.
 * Each category is an object of key-value pairs that must all match.
 * The feature matches if it matches ANY of the categories.
 *
 * @param {Object} featureProps - The properties of the feature.
 * @param {Object[]} categories - An array of category requirement objects.
 * @returns {boolean} True if the feature matches, false otherwise.
 */
export function matchesCategories(featureProps, categories) {
    if (!categories || !Array.isArray(categories) || categories.length === 0) return true;

    return categories.some(category => {
        return Object.entries(category).every(([key, value]) => {
            return featureProps[key] === value;
        });
    });
}

const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const allowedWords = new Set(['closed', 'off', '24/7']);
const dayNameRegex = /^(Mo|Tu|We|Th|Fr|Sa|Su)$/;
const dayRangeRegex = /^(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)$/;
const timeRegex = /^\d{1,2}:\d{2}$/;
const timeRangeRegex = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

/**
 * Identifies which days of the week are missing from an opening hours string.
 *
 * @param {string} oh - The opening hours string.
 * @returns {string[]|null} An array of missing day abbreviations (e.g., ['Mo', 'Tu']),
 *                          or null if the input is invalid or contains unexpected tokens.
 */
export function getMissingDays(oh) {
    if (!oh) return [...days];
    const normalized = oh.replace(/\s+/g, ' ').trim();
    if (normalized === '24/7') return [];

    const definedDays = new Set();

    // Check for unexpected words
    // We split by common separators and check if each token is allowed
    const tokens = normalized.split(/[ ,;]+/);

    for (const token of tokens) {
        if (!token) continue;
        if (allowedWords.has(token)) continue;
        if (timeRegex.test(token)) continue;
        if (timeRangeRegex.test(token)) continue;

        const rangeMatch = token.match(dayRangeRegex);
        if (rangeMatch) {
            const startDay = rangeMatch[1];
            const endDay = rangeMatch[2];
            const startIndex = days.indexOf(startDay);
            const endIndex = days.indexOf(endDay);
            let i = startIndex;
            while (true) {
                definedDays.add(days[i]);
                if (i === endIndex) break;
                i = (i + 1) % 7;
            }
            continue;
        }

        if (dayNameRegex.test(token)) {
            definedDays.add(token);
            continue;
        }

        // If it's none of the above, it's an unexpected word
        return null;
    }

    return days.filter(d => !definedDays.has(d));
}

/**
 * Checks if an opening hours string defines hours for all seven days of the week.
 *
 * @param {string} oh - The opening hours string.
 * @returns {boolean} True if all days are defined, false otherwise.
 */
export function areAllDaysDefined(oh) {
    const missing = getMissingDays(oh);
    return missing !== null && missing.length === 0;
}

/**
 * Formats an array of missing days into a human-readable string of ranges.
 *
 * @param {string[]} missingDays - An array of missing day abbreviations.
 * @returns {string} A formatted string of day ranges (e.g., 'Mo-Fr, Su').
 */
export function formatMissingDays(missingDays) {
    if (!missingDays || missingDays.length === 0) return '';

    const ranges = [];
    let start = 0;
    while (start < missingDays.length) {
        let end = start;
        while (
            end + 1 < missingDays.length &&
            days.indexOf(missingDays[end + 1]) === days.indexOf(missingDays[end]) + 1
        ) {
            end++;
        }

        if (start === end) {
            ranges.push(missingDays[start]);
        } else {
            ranges.push(`${missingDays[start]}-${missingDays[end]}`);
        }
        start = end + 1;
    }

    return ranges.join(', ');
}

/**
 * Checks if a string is a valid ISO date (YYYY-MM-DD).
 *
 * @param {string} date - The date string to check.
 * @returns {boolean|string} True if the date is valid, false otherwise.
 */
export function isValidIsoDate(date) {
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * Splits a semicolon-separated list into an array of trimmed, non-empty strings.
 *
 * @param {string|null|undefined} val - The string to split.
 * @returns {string[]} An array of split and trimmed values.
 */
export function splitSemicolonList(val) {
    if (!val) return [];
    return val
        .split(';')
        .map(v => v.trim())
        .filter(v => v !== '');
}

/**
 * Calculates the stability score and color for a spider based on its feature counts over time.
 *
 * @param {number[]} featureCounts - An array of feature counts for recent runs.
 * @param {boolean} isBrandSpider - Whether the spider is a brand spider.
 * @returns {Object} An object containing stabilityColor and stabilityScore.
 */
export function calculateStability(featureCounts, isBrandSpider) {
    const validCounts = featureCounts.filter(c => c !== null);

    if (!isBrandSpider) {
        return { stabilityColor: 'red', stabilityScore: 0.0 };
    }

    if (validCounts.length <= 1) {
        return { stabilityColor: 'gray', stabilityScore: 0.0 };
    }

    const minCount = Math.min(...validCounts);
    const maxCount = Math.max(...validCounts);
    const discrepancy = maxCount === 0 ? 0 : (maxCount - minCount) / maxCount;
    const stabilityScore = 1.0 - discrepancy;
    let stabilityColor = 'green';

    if (discrepancy > STABILITY_THRESHOLD_RED) {
        stabilityColor = 'red';
    } else if (discrepancy > STABILITY_THRESHOLD_ORANGE) {
        stabilityColor = 'orange';
    }

    return { stabilityColor, stabilityScore };
}
