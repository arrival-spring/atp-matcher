import opening_hours from 'opening_hours';
import { LRUCache } from 'lru-cache';
import { parsePhoneNumber } from 'libphonenumber-js';
import normalizeUrl from 'normalize-url';

const ohCache = new LRUCache({ max: 1000 });
const ohCompareCache = new LRUCache({ max: 5000 });

export const STATUS_PRIORITY = [
    'not a brand spider',
    'disallowed source uri',
    'duplicate ref',
    'mismatch',
    'update OSM',
    'not mapped',
    'Add to OSM',
    'matching',
];

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
        let transformedV1 = v1;
        transformedV1 = transformedV1.replace(/,\s?PH/g, '');
        transformedV1 = transformedV1.replace(/^PH,\s?/, '');
        transformedV1 = transformedV1.replace(/;\s?PH[^;]+$/, '');

        const oh1Transformed = getOH(transformedV1, country);
        if (oh1Transformed && oh2) {
            result = oh1Transformed.isEqualTo(oh2)[0];
        }
    }

    ohCompareCache.set(cacheKey, result);
    return result;
}

export function arePhonesEqual(osmValue, atpValue, country) {
    if (osmValue === atpValue) return true;
    if (!atpValue) return true;

    const splitValues = val => (val ? val.split(';').map(v => v.trim()) : []);

    const atpList = splitValues(atpValue)
        .map(v => {
            try {
                const p = parsePhoneNumber(v, country);
                return p.isValid() ? p.number : null;
            } catch {
                return null;
            }
        })
        .filter(v => v !== null);

    if (atpList.length === 0) return true;

    const osmList = splitValues(osmValue)
        .map(v => {
            try {
                const p = parsePhoneNumber(v, country);
                return p.isValid() ? p.number : null;
            } catch {
                return null;
            }
        })
        .filter(v => v !== null);

    return atpList.every(v => osmList.includes(v));
}

export function formatPhone(value, country) {
    if (!value) return null;
    try {
        const p = parsePhoneNumber(value, country);
        if (p.isValid()) {
            return p.formatInternational();
        }
    } catch {
        // ignore
    }
    return null;
}

export function normalizeWebsite(url) {
    if (!url) return null;
    try {
        return normalizeUrl(url, { forceHttps: true });
    } catch {
        return url;
    }
}

export function areWebsitesEqual(v1, v2) {
    if (v1 === v2) return true;
    if (!v1 || !v2) return false;
    return normalizeWebsite(v1) === normalizeWebsite(v2);
}

export function areEmailsEqual(osmValue, atpValue) {
    if (osmValue === atpValue) return true;
    if (!atpValue) return true;

    const splitValues = val => (val ? val.split(';').map(v => v.trim().toLowerCase()) : []);

    const atpList = splitValues(atpValue).filter(v => v !== '');
    if (atpList.length === 0) return true;

    const osmList = splitValues(osmValue).filter(v => v !== '');

    return atpList.every(v => osmList.includes(v));
}

export function areTagsEqual(tag, osmValue, atpValue, country) {
    if (tag === 'opening_hours') {
        return areOpeningHoursEqual(osmValue, atpValue, country);
    } else if (tag === 'phone') {
        return arePhonesEqual(osmValue, atpValue, country);
    } else if (tag === 'website') {
        return areWebsitesEqual(osmValue, atpValue);
    } else if (tag === 'email') {
        return areEmailsEqual(osmValue, atpValue);
    } else if (tag.startsWith('fuel:')) {
        const normalizeFuel = v => {
            if (v === null || v === undefined) return null;
            const s = v.toString().toLowerCase().trim();
            if (s === 'yes' || s === 'true' || s === '1') return 'yes';
            if (s === 'no' || s === 'false' || s === '0') return 'no';
            return s;
        };
        return normalizeFuel(osmValue) === normalizeFuel(atpValue);
    }
    return osmValue === atpValue;
}

export function getOverallStatus(statuses) {
    if (statuses.length === 0) return 'matching';
    for (const p of STATUS_PRIORITY) {
        if (statuses.includes(p)) return p;
    }
    return 'matching';
}
