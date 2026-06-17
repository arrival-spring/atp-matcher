import opening_hours from 'opening_hours';
import { LRUCache } from 'lru-cache';
import { parsePhoneNumber } from 'libphonenumber-js';
import normalizeUrl from 'normalize-url';
import { splitSemicolonList } from './utils.js';

const ohCache = new LRUCache({ max: 1000 });
const ohCompareCache = new LRUCache({ max: 5000 });
const webCache = new LRUCache({ max: 1000 });
const phoneCache = new LRUCache({ max: 1000 });

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
 * @param {string} [country] - The country code for localized parsing rules.
 * @returns {Object|null} The opening_hours object, or null if parsing fails.
 */
export function getOH(value, country) {
    if (!value) return null;
    const cacheKey = country ? `${value}|${country}` : value;
    if (ohCache.has(cacheKey)) return ohCache.get(cacheKey);

    try {
        const options = country ? { address: { country_code: country.toLowerCase() } } : undefined;
        const oh = new opening_hours(value, options);
        ohCache.set(cacheKey, oh);
        return oh;
    } catch {
        ohCache.set(cacheKey, null);
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
 * @param {string} [country] - The country code for localized parsing.
 * @returns {boolean} True if the opening hours are semantically equal, false otherwise.
 */
export function areOpeningHoursEqual(v1, v2, country) {
    if (v1 === v2) return true;

    const cacheKey = `${v1}|${v2}|${country}`;
    if (ohCompareCache.has(cacheKey)) return ohCompareCache.get(cacheKey);

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

    ohCompareCache.set(cacheKey, result);
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
 * Compares two phone number strings for equality.
 * Supports semicolon-separated lists and uses international formatting for comparison.
 *
 * @param {string} osmValue - The phone number(s) from OSM.
 * @param {string} atpValue - The phone number(s) from ATP.
 * @param {string} [country] - The country code for parsing.
 * @returns {boolean} True if all ATP numbers are present in the OSM list, false otherwise.
 */
export function arePhonesEqual(osmValue, atpValue, country) {
    if (osmValue === atpValue) return true;
    if (!atpValue) return true;

    const atpList = splitSemicolonList(atpValue)
        .map(v => getPhoneObject(v, country)?.number)
        .filter(v => !!v);

    if (atpList.length === 0) return true;

    const osmList = splitSemicolonList(osmValue)
        .map(v => getPhoneObject(v, country)?.number)
        .filter(v => !!v);

    return atpList.every(v => osmList.includes(v));
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
    if (phoneCache.has(cacheKey)) return phoneCache.get(cacheKey);

    const p = getPhoneObject(value, country);
    const result = p ? p.formatInternational() : null;
    phoneCache.set(cacheKey, result);
    return result;
}

/**
 * Normalizes a website URL.
 * Forces HTTPS and uses a cache to store results.
 *
 * @param {string} url - The URL to normalize.
 * @returns {string|null} The normalized URL, or null if input is empty.
 */
export function normalizeWebsite(url) {
    if (!url) return null;
    if (webCache.has(url)) return webCache.get(url);

    try {
        const result = normalizeUrl(url, { forceHttps: true });
        webCache.set(url, result);
        return result;
    } catch {
        webCache.set(url, url);
        return url;
    }
}

/**
 * Compares two website URLs for equality after normalization.
 *
 * @param {string} v1 - The first URL.
 * @param {string} v2 - The second URL.
 * @returns {boolean} True if the normalized URLs are equal, false otherwise.
 */
export function areWebsitesEqual(v1, v2) {
    if (v1 === v2) return true;
    if (!v1 || !v2) return false;
    return normalizeWebsite(v1) === normalizeWebsite(v2);
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
    if (osmValue === atpValue) return true;
    if (!atpValue) return true;

    const atpList = splitSemicolonList(atpValue).map(v => v.toLowerCase());
    if (atpList.length === 0) return true;

    const osmList = splitSemicolonList(osmValue).map(v => v.toLowerCase());

    return atpList.every(v => osmList.includes(v));
}

/**
 * Normalizes boolean-like fuel tag values to 'yes' or 'no'.
 *
 * @param {any} v - The value to normalize.
 * @returns {string|null} Normalized 'yes', 'no', or the original value.
 */
function normalizeFuel(v) {
    if (v === null || v === undefined) return null;
    const s = v.toString().toLowerCase().trim();
    if (['yes', 'true', '1'].includes(s)) return 'yes';
    if (['no', 'false', '0'].includes(s)) return 'no';
    return v;
}

/**
 * Compares two fuel tag values for semantic equality.
 *
 * @param {string} v1 - The first fuel value.
 * @param {string} v2 - The second fuel value.
 * @returns {boolean} True if the normalized values are equal, false otherwise.
 */
function areFuelTagsEqual(v1, v2) {
    return normalizeFuel(v1) === normalizeFuel(v2);
}

const TAG_COMPARATORS = {
    opening_hours: areOpeningHoursEqual,
    phone: arePhonesEqual,
    website: areWebsitesEqual,
    email: areEmailsEqual,
};

/**
 * Generic function to compare two tag values based on the tag type.
 * Dispatches to specific comparison functions for opening_hours, phone, website, email, and fuel tags.
 *
 * @param {string} tag - The OSM tag name.
 * @param {string} osmValue - The value from OSM.
 * @param {string} atpValue - The value from ATP.
 * @param {string} [country] - The country code for localized comparisons.
 * @returns {boolean} True if the values are considered equal, false otherwise.
 */
export function areTagsEqual(tag, osmValue, atpValue, country) {
    const comparator = TAG_COMPARATORS[tag];
    if (comparator) {
        return comparator(osmValue, atpValue, country);
    }
    if (tag.startsWith('fuel:')) {
        return areFuelTagsEqual(osmValue, atpValue);
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
