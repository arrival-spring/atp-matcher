/**
 * Escapes HTML special characters in a string.
 *
 * @param {string|null|undefined} unsafe - The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const VISITED_LINKS_KEY = 'visited_links';

/**
 * Retrieves the list of visited links from localStorage, filtered by the current ATP run date.
 *
 * @param {string} atpDate - The date of the current ATP run.
 * @returns {Object} An object containing the atpDate and an array of visited links.
 */
export function getVisitedLinks(atpDate) {
    if (typeof window === 'undefined') return { atpDate: atpDate, links: [] };
    const data = localStorage.getItem(VISITED_LINKS_KEY);
    if (!data) return { atpDate: atpDate, links: [] };

    try {
        const parsed = JSON.parse(data);
        if (parsed.atpDate !== atpDate) {
            return { atpDate: atpDate, links: [] };
        }
        return parsed;
    } catch {
        return { atpDate: atpDate, links: [] };
    }
}

/**
 * Marks a link as visited in localStorage for the current ATP run date.
 *
 * @param {string} url - The URL to mark as visited.
 * @param {string} atpDate - The date of the current ATP run.
 */
export function markLinkVisited(url, atpDate) {
    if (typeof window === 'undefined') return;
    const visited = getVisitedLinks(atpDate);
    if (!visited.links.includes(url)) {
        visited.links.push(url);
        localStorage.setItem(VISITED_LINKS_KEY, JSON.stringify(visited));
    }
}

/**
 * Handles clicking a JOSM remote control link.
 * Marks the link as visited and attempts to trigger the JOSM action.
 *
 * @param {string} url - The JOSM remote control URL.
 * @param {string|null} atpDate - The date of the current ATP run.
 * @param {Function} [onVisited] - Optional callback to run after marking the link as visited.
 * @param {Function} [onError] - Optional callback to run if the fetch request fails.
 */
export function handleJosmLink(url, atpDate, onVisited, onError) {
    markLinkVisited(url, atpDate);
    if (onVisited) onVisited();
    fetch(url, { mode: 'no-cors' }).catch(() => {
        if (onError) onError();
    });
}
