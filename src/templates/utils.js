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

export function renderStatusLabel(status) {
    if (!status) return '';
    return `
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-800 border border-gray-700 text-gray-300 capitalize inline-block align-middle ml-2">
            ${escapeHtml(status)}
        </span>
    `;
}

export function handleJosmLink(url, atpDate, renderCallback) {
    markLinkVisited(url, atpDate);
    if (renderCallback) renderCallback();
    fetch(url, { mode: 'no-cors' }).catch(() => {
        document.getElementById('josm-modal').classList.remove('hidden');
        document.getElementById('modal-backdrop').classList.remove('hidden');
    });
}

const VISITED_LINKS_KEY = 'visited_links';

export function getVisitedLinks(atpDate) {
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
    const visited = getVisitedLinks(atpDate);
    if (!visited.links.includes(url)) {
        visited.links.push(url);
        localStorage.setItem(VISITED_LINKS_KEY, JSON.stringify(visited));
    }
}
