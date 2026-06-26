import opening_hours from 'opening_hours';
import { LRUCache } from 'lru-cache';
import { parsePhoneNumber } from 'libphonenumber-js';
import normalizeUrl from 'normalize-url';
import { splitSemicolonList } from './shared_utils.js';

const OH_CACHE = new LRUCache({ max: 1000 });
const OH_COMPARE_CACHE = new LRUCache({ max: 5000 });
const WEB_CACHE = new LRUCache({ max: 1000 });
const PHONE_CACHE = new LRUCache({ max: 1000 });

/**
 * Priority order for item statuses. Lower index means higher priority.
 */
export const STATUS_PRIORITY = [
    'notABrandSpider',
    'disallowedSourceUri',
    'duplicateRef',
    'mismatch',
    'updateOsm',
    'notMapped',
    'addToOsm',
    'editMade',
    'matching',
];

/**
 * Parses an opening hours string into an opening_hours object.
 * Uses a cache to store previously parsed values.
 *
 * @param {string} value - The opening hours string.
 * @param {string} [country] - The country code for localised parsing rules.
 * @returns {Object|null} The opening_hours object, or null if parsing fails.
 */
export function getOH(value, country) {
    if (!value) return null;
    const cacheKey = country ? `${value}|${country}` : value;
    if (OH_CACHE.has(cacheKey)) return OH_CACHE.get(cacheKey);

    try {
        const options = country ? { address: { country_code: country.toLowerCase() } } : undefined;
        const oh = new opening_hours(value, options);
        OH_CACHE.set(cacheKey, oh);
        return oh;
    } catch {
        OH_CACHE.set(cacheKey, null);
        return null;
    }
}

/**
 * Strips 'PH' (Public Holiday) from an opening hours string.
 * Used for comparing ATP values (which usually lack PH info) with OSM values.
 *
 * @param {string} oh - The opening hours string to strip.
 * @returns {string} The stripped opening hours string.
 */
function stripPublicHolidays(oh) {
    if (!oh) return oh;
    return oh
        .replace(/,\s?PH/g, '')
        .replace(/^PH,\s?/, '')
        .replace(/;\s?PH[^;]+$/, '');
}

/**
 * Compares two opening hours strings for semantic equality.
 * Handles 'PH' (public holiday) differences by stripping them and re-comparing if needed.
 *
 * @param {string} v1 - The first opening hours string.
 * @param {string} v2 - The second opening hours string.
 * @param {string} [country] - The country code for localised parsing.
 * @returns {boolean} True if the opening hours are semantically equal, false otherwise.
 */
export function areOpeningHoursEqual(v1, v2, country) {
    if (v1 === v2) return true;

    const cacheKey = `${v1}|${v2}|${country}`;
    if (OH_COMPARE_CACHE.has(cacheKey)) return OH_COMPARE_CACHE.get(cacheKey);

    const oh1 = getOH(v1, country);
    const oh2 = getOH(v2, country);

    let result = false;
    if (oh1 === null && oh2 === null) {
        result = true;
    } else if (oh1 && oh2) {
        result = oh1.isEqualTo(oh2)[0];
    }

    if (!result && v1 && v2 && v1.includes('PH') && !v2.includes('PH')) {
        const transformedV1 = stripPublicHolidays(v1);
        const oh1Transformed = getOH(transformedV1, country);
        if (oh1Transformed && oh2) {
            result = oh1Transformed.isEqualTo(oh2)[0];
        }
    }

    OH_COMPARE_CACHE.set(cacheKey, result);
    return result;
}

/**
 * Internal helper to parse and validate a phone number.
 *
 * @param {string} value - The phone number string.
 * @param {string} [country] - The country code for parsing.
 * @returns {Object|null} The parsed phone number object, or null if invalid.
 */
function getPhoneObject(value, country) {
    try {
        const p = parsePhoneNumber(value, country);
        return p.isValid() ? p : null;
    } catch {
        return null;
    }
}

/**
 * Internal helper to compare two semicolon-separated lists for equality.
 *
 * @param {string} osmValue - The value(s) from OSM.
 * @param {string} atpValue - The value(s) from ATP.
 * @param {Function} normaliser - A function to normalise each value in the list.
 * @returns {boolean} True if all ATP values are present in the OSM list, false otherwise.
 */
function areListsEqual(osmValue, atpValue, normaliser) {
    if (osmValue === atpValue) return true;
    if (!atpValue) return true;

    const atpList = splitSemicolonList(atpValue)
        .map(normaliser)
        .filter(v => !!v);

    if (atpList.length === 0) return true;

    const osmList = splitSemicolonList(osmValue)
        .map(normaliser)
        .filter(v => !!v);

    return atpList.every(v => osmList.includes(v));
}

/**
 * Compares two phone number strings for equality.
 * Supports semicolon-separated lists and uses international formatting for comparison.
 *
 * @param {string} osmValue - The phone number(s) from OSM.
 * @param {string} atpValue - The phone number(s) from ATP.
 * @param {string} [country] - The country code for parsing.
 * @returns {boolean} True if all ATP numbers are present in the OSM list, false otherwise.
 */
export function arePhonesEqual(osmValue, atpValue, country) {
    return areListsEqual(osmValue, atpValue, v => getPhoneObject(v, country)?.number);
}

/**
 * Formats a phone number string into international format.
 *
 * @param {string} value - The phone number to format.
 * @param {string} [country] - The country code for parsing.
 * @returns {string|null} The formatted phone number, or null if invalid.
 */
export function formatPhone(value, country) {
    if (!value) return null;
    const cacheKey = country ? `${value}|${country}` : value;
    if (PHONE_CACHE.has(cacheKey)) return PHONE_CACHE.get(cacheKey);

    const parts = splitSemicolonList(value);
    const formattedParts = parts
        .map(p => getPhoneObject(p, country))
        .filter(p => p !== null)
        .map(p => p.formatInternational());

    const result = formattedParts.length > 0 ? formattedParts.join('; ') : null;
    PHONE_CACHE.set(cacheKey, result);
    return result;
}

/**
 * Normalises a website URL.
 * Forces HTTPS and uses a cache to store results.
 *
 * @param {string} url - The URL to normalise.
 * @returns {string|null} The normalised URL, or null if input is empty.
 */
export function normaliseWebsite(url) {
    if (!url) return null;
    if (WEB_CACHE.has(url)) return WEB_CACHE.get(url);

    try {
        const result = normalizeUrl(url, { forceHttps: true });
        WEB_CACHE.set(url, result);
        return result;
    } catch {
        WEB_CACHE.set(url, url);
        return url;
    }
}

/**
 * Compares two website URLs for equality after normalisation.
 *
 * @param {string} v1 - The first URL.
 * @param {string} v2 - The second URL.
 * @returns {boolean} True if the normalised URLs are equal, false otherwise.
 */
export function areWebsitesEqual(v1, v2) {
    if (v1 === v2) return true;
    if (!v1 || !v2) return false;
    return normaliseWebsite(v1) === normaliseWebsite(v2);
}

/**
 * Compares two email strings for equality.
 * Supports semicolon-separated lists and is case-insensitive.
 *
 * @param {string} osmValue - The email(s) from OSM.
 * @param {string} atpValue - The email(s) from ATP.
 * @returns {boolean} True if all ATP emails are present in the OSM list, false otherwise.
 */
export function areEmailsEqual(osmValue, atpValue) {
    return areListsEqual(osmValue, atpValue, v => v.toLowerCase());
}

const TAG_COMPARATORS = {
    opening_hours: areOpeningHoursEqual,
    phone: arePhonesEqual,
    website: areWebsitesEqual,
    email: areEmailsEqual,
};

/**
 * Generic function to compare two tag values based on the tag type.
 * Dispatches to specific comparison functions for opening_hours, phone, website, and email tags.
 *
 * @param {string} tag - The OSM tag name.
 * @param {string} osmValue - The value from OSM.
 * @param {string} atpValue - The value from ATP.
 * @param {string} [country] - The country code for localised comparisons.
 * @returns {boolean} True if the values are considered equal, false otherwise.
 */
export function areTagsEqual(tag, osmValue, atpValue, country) {
    const comparator = TAG_COMPARATORS[tag];
    if (comparator) {
        return comparator(osmValue, atpValue, country);
    }
    return osmValue === atpValue;
}

/**
 * Determines the overall status of an item based on the statuses of its individual tags.
 * Returns the highest priority status present in the list.
 *
 * @param {string[]} statuses - An array of tag statuses.
 * @returns {string} The overall item status.
 */
export function getOverallStatus(statuses) {
    if (statuses.length === 0) return 'matching';
    for (const p of STATUS_PRIORITY) {
        if (statuses.includes(p)) return p;
    }
    return 'matching';
}
