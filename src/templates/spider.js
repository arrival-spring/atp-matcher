export function initSpiderDashboard(results, importableTags) {
    const PAGE_SIZE = 25;
    let currentState = {
        tag: 'summary',
        status: null,
        page: 1,
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
        if (unsafe === null || unsafe === undefined) return '';
        return unsafe
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function isStable(history) {
        if (!history || history.length < 2) return true;

        // The requirement says: "if it is stable then a green tick or something, if not then show the values from the last 4 runs"
        // We consider it stable if all 4 runs have the same value.
        const values = history.map(h => h.value);
        return values.every(v => v === values[0]);
    }

    function renderTagValue(value, tag) {
        const escaped = escapeHtml(value);
        if (tag === 'website' && value) {
            return `<a href="${escaped}" target="_blank" class="text-blue-400 hover:underline break-all">${escaped}</a>`;
        }
        return `<code class="text-sm break-all">${escaped}</code>`;
    }

    function renderSpiderValue(spiderValue, history, tag) {
        if (!spiderValue) return '';

        const nonNullValues = history ? history.filter(h => h.value !== null) : [];
        const isStableValue = nonNullValues.length <= 1 || nonNullValues.every(v => v.value === spiderValue); // Simplified equality for UI

        if (isStableValue) {
            return `
                <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="stable value">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                    </svg>
                    ${renderTagValue(spiderValue, tag)}
                </div>
            `;
        } else {
            const historyHtml = history
                .filter(h => h.value)
                .map(
                    h => `
                <div class="text-xs text-gray-400">
                    <span class="font-mono">${h.date}</span>: <span class="text-gray-300">${renderTagValue(h.value, tag)}</span>
                </div>
            `
                )
                .join('');
            return `
                <div class="space-y-1">
                    <div class="font-bold text-white">${renderTagValue(spiderValue, tag)}</div>
                    <div class="pl-2 border-l border-gray-700">
                        ${historyHtml}
                    </div>
                </div>
            `;
        }
    }

    function render() {
        const isUniquelyMatched = r => r.matchCount === 1 && r.status !== 'disallowed source uri';
        const hasDuplicates = results.some(r => r.matchCount > 1);

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

        if (currentState.tag === 'unmapped') {
            renderUnmapped();
            return;
        }

        if (currentState.tag === 'duplicate-refs') {
            renderDuplicates();
            return;
        }

        // Update Status Filters
        const filterContainer = document.getElementById(`${currentState.tag}-status-filters`);
        if (!filterContainer) return;

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
        const tagResults = results
            .filter(isUniquelyMatched)
            .map(r => {
                const tagData = r.tags.find(t => t.tag === currentState.tag);
                return tagData
                    ? {
                          ...r,
                          tagStatus: tagData.status,
                          osmValue: tagData.osmValue,
                          spiderValue: tagData.spiderValue,
                          history: tagData.history,
                      }
                    : null;
            })
            .filter(r => r !== null);

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
        if (!table) return;

        const thead = table.querySelector('thead');

        const showOsmColumns = currentState.status !== 'no OSM tag';

        thead.innerHTML = `
            <tr>
                <th class="px-4 py-3">Ref</th>
                <th class="px-4 py-3">Spider Value</th>
                ${showOsmColumns ? '<th class="px-4 py-3">OSM Value</th>' : ''}
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3 text-right">OSM</th>
            </tr>
        `;

        const tbody = table.querySelector('tbody');
        tbody.innerHTML = pageData
            .map(r => {
                const suggestedFixes = {};
                if (r.tagStatus === 'mismatch' || r.tagStatus === 'no OSM tag' || r.tagStatus === 'update OSM') {
                    suggestedFixes[currentState.tag] = r.spiderValue;
                }

                const refDisplay = escapeHtml(r.ref);

                return `
            <tr class="hover:bg-gray-800 transition-colors">
                <td class="px-4 py-3 font-medium max-w-xs break-all">${refDisplay}</td>
                <td class="px-4 py-3">${renderSpiderValue(r.spiderValue, r.history, currentState.tag)}</td>
                ${showOsmColumns ? `<td class="px-4 py-3">${renderTagValue(r.osmValue, currentState.tag)}</td>` : ''}
                <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs font-semibold bg-gray-800 border border-gray-700 text-gray-300 capitalize">
                        ${escapeHtml(r.tagStatus)}
                    </span>
                </td>
                <td class="px-4 py-3 text-right">
                    ${renderOsmColumn(r.osmId, suggestedFixes)}
                </td>
            </tr>
        `;
            })
            .join('');

        // Update Pagination
        const pagination = document.getElementById(`${currentState.tag}-pagination`);
        if (!pagination) return;

        pagination.querySelector('.page-info').textContent = `Page ${currentState.page} of ${totalPages}`;
        pagination.querySelector('.prev-btn').disabled = currentState.page === 1;
        pagination.querySelector('.next-btn').disabled = currentState.page === totalPages || filtered.length === 0;
    }

    function renderUnmapped() {
        const isUniquelyMatched = r => r.matchCount === 1 && r.status !== 'disallowed source uri';
        const isDuplicate = r => r.matchCount > 1;
        const unmapped = results.filter(
            r => r.status === 'disallowed source uri' || (!isUniquelyMatched(r) && !isDuplicate(r))
        );
        const totalPages = Math.ceil(unmapped.length / PAGE_SIZE) || 1;
        if (currentState.page > totalPages) currentState.page = totalPages;

        const start = (currentState.page - 1) * PAGE_SIZE;
        const pageData = unmapped.slice(start, start + PAGE_SIZE);

        const tbody = document.querySelector('#unmapped-table tbody');
        tbody.innerHTML = pageData
            .map(
                r => `
            <tr class="hover:bg-gray-800 transition-colors">
                <td class="px-4 py-3 font-medium max-w-xs break-all">${escapeHtml(r.ref)}</td>
                <td class="px-4 py-3 text-xs font-mono whitespace-pre-wrap">${Object.entries(r.allAtpTags || {})
                    .map(([k, v]) => `${escapeHtml(k)}=${escapeHtml(v)}`)
                    .join('\n')}</td>
                <td class="px-4 py-3 font-medium text-red-400 capitalize">${escapeHtml(r.status)}</td>
            </tr>
        `
            )
            .join('');

        const pagination = document.getElementById('unmapped-pagination');
        pagination.querySelector('.page-info').textContent = `Page ${currentState.page} of ${totalPages}`;
        pagination.querySelector('.prev-btn').disabled = currentState.page === 1;
        pagination.querySelector('.next-btn').disabled = currentState.page === totalPages || unmapped.length === 0;
    }

    function renderDuplicates() {
        const duplicates = results.filter(r => r.matchCount > 1 && r.status !== 'disallowed source uri');
        const totalPages = Math.ceil(duplicates.length / PAGE_SIZE) || 1;
        if (currentState.page > totalPages) currentState.page = totalPages;

        const start = (currentState.page - 1) * PAGE_SIZE;
        const pageData = duplicates.slice(start, start + PAGE_SIZE);

        const tbody = document.querySelector('#duplicate-refs-table tbody');
        tbody.innerHTML = pageData
            .map(
                r => `
            <tr class="hover:bg-gray-800 transition-colors">
                <td class="px-4 py-3 font-medium max-w-xs break-all">${escapeHtml(r.ref)}</td>
                <td class="px-4 py-3 text-xs font-mono whitespace-pre-wrap">${Object.entries(r.allAtpTags || {})
                    .map(([k, v]) => `${escapeHtml(k)}=${escapeHtml(v)}`)
                    .join('\n')}</td>
                <td class="px-4 py-3 font-medium text-red-400 capitalize">${escapeHtml(r.status)} (${r.matchCount} matches)</td>
            </tr>
        `
            )
            .join('');

        const pagination = document.getElementById('duplicate-refs-pagination');
        pagination.querySelector('.page-info').textContent = `Page ${currentState.page} of ${totalPages}`;
        pagination.querySelector('.prev-btn').disabled = currentState.page === 1;
        pagination.querySelector('.next-btn').disabled = currentState.page === totalPages || duplicates.length === 0;
    }

    window.handleJosmLink = function (url) {
        fetch(url, { mode: 'no-cors' }).catch(() => {
            document.getElementById('josm-modal').classList.remove('hidden');
            document.getElementById('modal-backdrop').classList.remove('hidden');
        });
    };

    function renderOsmColumn(osmId, suggestedFixes = {}) {
        if (!osmId) return '';
        const typeMap = { n: 'node', w: 'way', r: 'relation' };
        const typeChar = osmId.toString()[0];
        const osmType = typeMap[typeChar];
        const id = osmId.toString().substring(1);
        if (!osmType) return '';

        const josmFixBaseUrl = 'http://127.0.0.1:8111/load_object';
        const josmEditUrl = `${josmFixBaseUrl}?objects=${osmType[0]}${id}&relation_members=true`;

        const encodedTags = Object.entries(suggestedFixes).map(([key, value]) => {
            const encodedKey = encodeURIComponent(key);
            const encodedValue = value ? encodeURIComponent(value) : '';
            return `${encodedKey}=${encodedValue}`;
        });

        const addtagsValue = encodedTags.join(encodeURIComponent('|'));
        const josmUpdateUrl = `${josmEditUrl}&addtags=${addtagsValue}`;

        const hasFixes = Object.keys(suggestedFixes).length > 0;
        return `
            <div class="flex flex-col items-end gap-1">
                <a href="https://www.openstreetmap.org/${osmType}/${id}" target="_blank" class="inline-flex items-center text-blue-400 hover:underline">
                    <span>${osmId}</span>
                    <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                </a>
                <div class="text-xs text-gray-500">
                    JOSM:
                    <a href="javascript:void(0)" onclick="handleJosmLink('${josmEditUrl}')" class="text-blue-400 hover:underline">edit</a>
                    ${hasFixes ? `<a href="javascript:void(0)" onclick="handleJosmLink('${josmUpdateUrl}')" class="text-blue-400 hover:underline ml-1">update</a>` : ''}
                </div>
            </div>
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
        panel.querySelector(`[id="${tag}-status-filters"]`).addEventListener('click', e => {
            const btn = e.target.closest('button');
            if (!btn || btn.disabled) return;

            const newStatus = btn.dataset.status;
            currentState.status = currentState.status === newStatus ? null : newStatus;
            currentState.page = 1;
            updateUrl();
            render();
        });

        // Pagination listeners
        const pagination = panel.querySelector(`[id="${tag}-pagination"]`);
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

    // Unmapped pagination
    const unmappedPagination = document.getElementById('unmapped-pagination');
    unmappedPagination.querySelector('.prev-btn').onclick = () => {
        if (currentState.page > 1) {
            currentState.page--;
            updateUrl();
            render();
        }
    };
    unmappedPagination.querySelector('.next-btn').onclick = () => {
        currentState.page++;
        updateUrl();
        render();
    };

    // Duplicate Refs pagination
    const duplicatesPagination = document.getElementById('duplicate-refs-pagination');
    if (duplicatesPagination) {
        duplicatesPagination.querySelector('.prev-btn').onclick = () => {
            if (currentState.page > 1) {
                currentState.page--;
                updateUrl();
                render();
            }
        };
        duplicatesPagination.querySelector('.next-btn').onclick = () => {
            currentState.page++;
            updateUrl();
            render();
        };
    }

    window.onpopstate = () => {
        loadStateFromUrl();
        render();
    };

    // Initial load
    loadStateFromUrl();
    render();
}
