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

export function markLinkVisited(url, atpDate) {
    if (typeof window === 'undefined') return;
    const visited = getVisitedLinks(atpDate);
    if (!visited.links.includes(url)) {
        visited.links.push(url);
        localStorage.setItem(VISITED_LINKS_KEY, JSON.stringify(visited));
    }
}

export function handleJosmLink(url, atpDate, onVisited, onError) {
    markLinkVisited(url, atpDate);
    if (onVisited) onVisited();
    fetch(url, { mode: 'no-cors' }).catch(() => {
        if (onError) onError();
    });
}
