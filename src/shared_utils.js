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

/**
 * Expands wildcard tags (ending in ':*') by checking them against properties of provided features.
 *
 * @param {string[]} importableTags - Array of tag names, possibly including wildcards.
 * @param {Object[]} features - Array of GeoJSON features to check against.
 * @returns {Set<string>} A set of expanded tag names.
 */
export function getExpandedTags(importableTags, features) {
    const expanded = new Set();
    if (!importableTags) return expanded;

    const wildcards = importableTags.filter(t => t.endsWith(':*')).map(t => t.slice(0, -1));
    const staticTags = importableTags.filter(t => !t.endsWith(':*'));

    staticTags.forEach(t => expanded.add(t));

    if (wildcards.length > 0 && features) {
        for (const feature of features) {
            if (!feature.properties) continue;
            for (const key of Object.keys(feature.properties)) {
                for (const wildcard of wildcards) {
                    if (key.startsWith(wildcard)) {
                        expanded.add(key);
                    }
                }
            }
        }
    }
    return expanded;
}

/**
 * Array of day abbreviations for the week.
 * @type {string[]}
 */
export const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * Set of allowed special words in opening hours.
 * @type {Set<string>}
 */
export const ALLOWED_WORDS = new Set(['closed', 'off', '24/7']);

/**
 * Regex for a single day name.
 * @type {RegExp}
 */
export const DAY_NAME_REGEX = /^(Mo|Tu|We|Th|Fr|Sa|Su)$/;

/**
 * Regex for a day range (e.g., Mo-Fr).
 * @type {RegExp}
 */
export const DAY_RANGE_REGEX = /^(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)$/;

/**
 * Regex for a single time (e.g., 08:00).
 * @type {RegExp}
 */
export const TIME_REGEX = /^\d{1,2}:\d{2}$/;

/**
 * Regex for a time range (e.g., 08:00-18:00).
 * @type {RegExp}
 */
export const TIME_RANGE_REGEX = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

/**
 * Identifies which days of the week are missing from an opening hours string.
 *
 * @param {string} oh - The opening hours string.
 * @returns {string[]|null} An array of missing day abbreviations (e.g., ['Mo', 'Tu']),
 *                          or null if the input is invalid or contains unexpected tokens.
 */
export function getMissingDays(oh) {
    if (!oh) return [...DAYS];
    const normalised = oh.replace(/\s+/g, ' ').trim();
    if (normalised === '24/7') return [];

    const definedDays = new Set();

    // Check for unexpected words
    // We split by common separators and check if each token is allowed
    const tokens = normalised.split(/[ ,;]+/);

    for (const token of tokens) {
        if (!token) continue;
        if (ALLOWED_WORDS.has(token)) continue;
        if (TIME_REGEX.test(token)) continue;
        if (TIME_RANGE_REGEX.test(token)) continue;

        const rangeMatch = token.match(DAY_RANGE_REGEX);
        if (rangeMatch) {
            const startDay = rangeMatch[1];
            const endDay = rangeMatch[2];
            const startIndex = DAYS.indexOf(startDay);
            const endIndex = DAYS.indexOf(endDay);
            let i = startIndex;
            while (true) {
                definedDays.add(DAYS[i]);
                if (i === endIndex) break;
                i = (i + 1) % 7;
            }
            continue;
        }

        if (DAY_NAME_REGEX.test(token)) {
            definedDays.add(token);
            continue;
        }

        // If it's none of the above, it's an unexpected word
        return null;
    }

    return DAYS.filter(d => !definedDays.has(d));
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
            DAYS.indexOf(missingDays[end + 1]) === DAYS.indexOf(missingDays[end]) + 1
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
 * @returns {boolean} True if the date is valid, false otherwise.
 */
export function isValidIsoDate(date) {
    return !!(date && /^\d{4}-\d{2}-\d{2}$/.test(date));
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
 * Calculates the stability score and colour for a spider based on its feature counts over time.
 *
 * @param {number[]} featureCounts - An array of feature counts for recent runs.
 * @param {boolean} isBrandSpider - Whether the spider is a brand spider.
 * @returns {Object} An object containing stabilityColour and stabilityScore.
 */
export function calculateStability(featureCounts, isBrandSpider) {
    const validCounts = featureCounts.filter(c => c !== null);

    if (!isBrandSpider) {
        return { stabilityColour: 'red', stabilityScore: 0.0 };
    }

    if (validCounts.length <= 1) {
        return { stabilityColour: 'grey', stabilityScore: 0.0 };
    }

    const minCount = Math.min(...validCounts);
    const maxCount = Math.max(...validCounts);
    const discrepancy = maxCount === 0 ? 0 : (maxCount - minCount) / maxCount;
    const stabilityScore = 1.0 - discrepancy;
    let stabilityColour = 'green';

    if (discrepancy > STABILITY_THRESHOLD_RED) {
        stabilityColour = 'red';
    } else if (discrepancy > STABILITY_THRESHOLD_ORANGE) {
        stabilityColour = 'orange';
    }

    return { stabilityColour, stabilityScore };
}
