import { URL } from 'url';

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

const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const allowedWords = new Set(['closed', 'off', '24/7']);
const dayNameRegex = /^(Mo|Tu|We|Th|Fr|Sa|Su)$/;
const dayRangeRegex = /^(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)$/;
const timeRegex = /^\d{1,2}:\d{2}$/;
const timeRangeRegex = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

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

export function areAllDaysDefined(oh) {
    const missing = getMissingDays(oh);
    return missing !== null && missing.length === 0;
}

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
