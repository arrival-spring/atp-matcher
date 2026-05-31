export function initSpiderDashboard(results, importableTags) {
    const PAGE_SIZE = 50;
    let currentState = {
        tag: 'summary',
        status: null,
        page: 1
    };

    function updateUrl() {
        const url = new URL(window.location);
        url.hash = `tag=${currentState.tag}${currentState.status ? `&status=${currentState.status}` : ''}${currentState.page > 1 ? `&page=${currentState.page}` : ''}`;
        window.history.pushState({}, '', url);
    }

    function loadStateFromUrl() {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        currentState.tag = params.get('tag') || 'summary';
        currentState.status = params.get('status');
        currentState.page = parseInt(params.get('page')) || 1;
    }

    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return "";
        return unsafe
            .toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function isStable(history) {
        if (!history || history.length < 2) return true;

        // The requirement says: "if it is stable then a green tick or something, if not then show the values from the last 4 runs"
        // We consider it stable if all 4 runs have the same value.
        const values = history.map(h => h.value);
        return values.every(v => v === values[0]);
    }

    function renderSpiderValue(spiderValue, history) {
        if (!spiderValue) return '';

        if (isStable(history)) {
            return `
                <div class="flex items-center gap-2">
                    <code class="text-sm break-all">${escapeHtml(spiderValue)}</code>
                    <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                    </svg>
                </div>
            `;
        } else {
            const historyHtml = history.filter(h => h.value).map(h => `
                <div class="text-xs text-gray-400">
                    <span class="font-mono">${h.date}</span>: <code class="text-gray-300">${escapeHtml(h.value)}</code>
                </div>
            `).join('');
            return `
                <div class="space-y-1">
                    <code class="text-sm break-all font-bold text-white">${escapeHtml(spiderValue)}</code>
                    <div class="pl-2 border-l border-gray-700">
                        ${historyHtml}
                    </div>
                </div>
            `;
        }
    }

    function render() {
        // Update Tabs
        document.querySelectorAll('#tag-tabs button').forEach(btn => {
            if (btn.dataset.tab === currentState.tag) {
                btn.classList.add('text-blue-500', 'border-blue-500');
                btn.classList.remove('border-transparent');
            } else {
                btn.classList.remove('text-blue-500', 'border-blue-500');
                btn.classList.add('border-transparent');
            }
        });

        // Update Content visibility
        document.querySelectorAll('[role="tabpanel"]').forEach(panel => {
            panel.classList.toggle('hidden', panel.id !== `${currentState.tag}-content`);
        });

        if (currentState.tag === 'summary') return;

        // Update Status Filters
        const filterContainer = document.getElementById(`${currentState.tag}-status-filters`);
        filterContainer.querySelectorAll('button').forEach(btn => {
            if (btn.dataset.status === currentState.status) {
                btn.classList.add('bg-blue-600', 'border-blue-500', 'text-white');
                btn.classList.remove('text-gray-300', 'hover:bg-gray-700');
            } else {
                btn.classList.remove('bg-blue-600', 'border-blue-500', 'text-white');
                if (!btn.disabled) {
                    btn.classList.add('text-gray-300', 'hover:bg-gray-700');
                }
            }
        });

        // Filter and Paginate Data
        const tagResults = results.map(r => {
            const tagData = r.tags.find(t => t.tag === currentState.tag);
            return tagData ? { ...r, tagStatus: tagData.status, osmValue: tagData.osmValue, spiderValue: tagData.spiderValue, history: tagData.history } : null;
        }).filter(r => r !== null);

        let filtered = tagResults;
        if (currentState.status) {
            filtered = tagResults.filter(r => r.tagStatus === currentState.status);
        }

        const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
        if (currentState.page > totalPages) currentState.page = totalPages;

        const start = (currentState.page - 1) * PAGE_SIZE;
        const pageData = filtered.slice(start, start + PAGE_SIZE);

        // Update Table Headers and Content
        const table = document.getElementById(`${currentState.tag}-table`);
        const thead = table.querySelector('thead');

        const showOsmColumns = currentState.status !== 'not mapped' && currentState.status !== 'no OSM tag';
        const showOsmLink = currentState.status !== 'not mapped';

        thead.innerHTML = `
            <tr>
                <th class="px-4 py-3">Ref</th>
                <th class="px-4 py-3">Spider Value</th>
                ${showOsmColumns ? '<th class="px-4 py-3">OSM Value</th>' : ''}
                <th class="px-4 py-3">Status</th>
                ${showOsmLink ? '<th class="px-4 py-3 text-right">OSM Link</th>' : ''}
            </tr>
        `;

        const tbody = table.querySelector('tbody');
        tbody.innerHTML = pageData.map(r => `
            <tr class="hover:bg-gray-800 transition-colors">
                <td class="px-4 py-3 font-medium max-w-xs break-all">${escapeHtml(r.ref)}</td>
                <td class="px-4 py-3">${renderSpiderValue(r.spiderValue, r.history)}</td>
                ${showOsmColumns ? `<td class="px-4 py-3"><code class="text-sm break-all">${escapeHtml(r.osmValue)}</code></td>` : ''}
                <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs font-semibold bg-gray-800 border border-gray-700 text-gray-300 capitalize">
                        ${escapeHtml(r.tagStatus)}
                    </span>
                </td>
                ${showOsmLink ? `
                <td class="px-4 py-3 text-right">
                    ${renderOsmLink(r.osmId)}
                </td>` : ''}
            </tr>
        `).join('');

        // Update Pagination
        const pagination = document.getElementById(`${currentState.tag}-pagination`);
        pagination.querySelector('.page-info').textContent = `Page ${currentState.page} of ${totalPages}`;
        pagination.querySelector('.prev-btn').disabled = currentState.page === 1;
        pagination.querySelector('.next-btn').disabled = currentState.page === totalPages || filtered.length === 0;
    }

    function renderOsmLink(osmId) {
        if (!osmId) return '';
        const typeMap = { 'n': 'node', 'w': 'way', 'r': 'relation' };
        const typeChar = osmId.toString()[0];
        const id = osmId.toString().substring(1);
        if (!typeMap[typeChar]) return '';

        return `
            <a href="https://www.openstreetmap.org/${typeMap[typeChar]}/${id}" target="_blank" class="inline-flex items-center text-blue-400 hover:underline">
                <span>${osmId}</span>
                <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
            </a>
        `;
    }

    // Event Listeners
    document.getElementById('tag-tabs').addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        currentState.tag = btn.dataset.tab;
        currentState.status = null;
        currentState.page = 1;
        updateUrl();
        render();
    });

    importableTags.forEach(tag => {
        const panel = document.getElementById(`${tag}-content`);
        if (!panel) return;

        // Status filter listeners
        panel.querySelector(`#${tag}-status-filters`).addEventListener('click', e => {
            const btn = e.target.closest('button');
            if (!btn || btn.disabled) return;

            const newStatus = btn.dataset.status;
            currentState.status = (currentState.status === newStatus) ? null : newStatus;
            currentState.page = 1;
            updateUrl();
            render();
        });

        // Pagination listeners
        const pagination = panel.querySelector(`#${tag}-pagination`);
        pagination.querySelector('.prev-btn').onclick = () => {
            if (currentState.page > 1) {
                currentState.page--;
                updateUrl();
                render();
            }
        };
        pagination.querySelector('.next-btn').onclick = () => {
            currentState.page++;
            updateUrl();
            render();
        };
    });

    window.onpopstate = () => {
        loadStateFromUrl();
        render();
    };

    // Initial load
    loadStateFromUrl();
    render();
}
