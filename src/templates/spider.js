import { escapeHtml, renderStatusLabel, handleJosmLink, getVisitedLinks, markLinkVisited } from './utils.js';

export function initSpiderDashboard(spiderName, results, importableTags, atpDate, showUnmatched) {
    const PAGE_SIZE = 25;
    let currentState = {
        tag: 'summary',
        status: null,
        page: 1,
    };

    let unmappedCache = null;
    let unmatchedCache = null;

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

        // Reset all tab counts first
        document.querySelectorAll('#tag-tabs .tab-count').forEach(el => el.classList.add('hidden'));
    }

    function isStable(history) {
        if (!history || history.length < 2) return true;

        // The requirement says: "if it is stable then a green tick or something, if not then show the values from the last 4 runs"
        // We consider it stable if all 4 runs have the same value.
        const values = history.map(h => h.value);
        return values.every(v => v === values[0]);
    }

    function renderTagValue(value, tag, visitedSet = new Set()) {
        const escaped = escapeHtml(value);
        if ((tag === 'website' || tag === 'contact:website') && value) {
            const isVisited = visitedSet.has(value);
            return `<a href="${escaped}" target="_blank" data-link-type="website" class="${isVisited ? 'text-gray-600' : 'text-blue-400'} hover:underline break-all">${escaped}</a>`;
        }
        return `<code class="text-sm break-all">${escaped}</code>`;
    }

    function renderTagsWithLinks(tags, visitedSet = new Set()) {
        return Object.entries(tags || {})
            .map(([k, v]) => {
                const escapedK = escapeHtml(k);
                let valueHtml;
                if (k === 'website' || k === 'contact:website') {
                    valueHtml = renderTagValue(v, k, visitedSet);
                } else {
                    valueHtml = escapeHtml(v);
                }
                return `${escapedK}=${valueHtml}`;
            })
            .join('\n');
    }

    function renderSpiderValue(spiderValue, history, tag, visitedSet = new Set()) {
        if (!spiderValue) return '';

        const nonNullValues = history ? history.filter(h => h.value !== null) : [];
        const isStableValue = nonNullValues.length <= 1 || nonNullValues.every(v => v.value === spiderValue); // Simplified equality for UI

        if (isStableValue) {
            return `
                <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="stable value">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                    </svg>
                    ${renderTagValue(spiderValue, tag, visitedSet)}
                </div>
            `;
        } else {
            const historyHtml = [...history]
                .reverse()
                .filter(h => h.value)
                .map(
                    h => `
                <div class="text-xs text-gray-400">
                    <span class="font-mono">${h.date}</span>: <span class="text-gray-300">${renderTagValue(h.value, tag, visitedSet)}</span>
                </div>
            `
                )
                .join('');
            return `
                <div class="space-y-1">
                    <div class="font-bold text-white">${renderTagValue(spiderValue, tag, visitedSet)}</div>
                    <div class="pl-2 border-l border-gray-700">
                        ${historyHtml}
                    </div>
                </div>
            `;
        }
    }

    function showModal({ title, message, onUnderstand, showImportBtn = false }) {
        const modal = document.getElementById('mismatch-modal');
        const backdrop = document.getElementById('modal-backdrop');
        const confirmBtn = document.getElementById('mismatch-understand-btn');
        const importBtn = document.getElementById('mismatch-import-btn');
        const progress = document.getElementById('mismatch-progress');
        const titleEl = modal.querySelector('h3');
        const messageEl = modal.querySelector('p');

        titleEl.textContent = title;
        messageEl.innerHTML = message;

        modal.classList.remove('hidden');
        backdrop.classList.remove('hidden');
        confirmBtn.classList.remove('hidden');
        importBtn.classList.add('hidden');

        // Reset and start 2s timeout
        confirmBtn.disabled = true;
        confirmBtn.classList.remove('cursor-pointer', 'hover:bg-blue-500');
        progress.style.transition = 'none';
        progress.style.width = '0';

        // Trigger animation
        setTimeout(() => {
            progress.style.transition = 'width 2s linear';
            progress.style.width = '100%';
        }, 10);

        setTimeout(() => {
            confirmBtn.disabled = false;
            confirmBtn.classList.add('cursor-pointer', 'hover:bg-blue-500');
        }, 2000);

        confirmBtn.onclick = () => {
            if (showImportBtn) {
                confirmBtn.classList.add('hidden');
                importBtn.classList.remove('hidden');
            }
            onUnderstand();
        };
    }

    function showMismatchWarning() {
        const warnedTags = JSON.parse(sessionStorage.getItem(`mismatch_warned_tags_${spiderName}`) || '[]');
        if (currentState.status === 'mismatch' && !warnedTags.includes(currentState.tag)) {
            showModal({
                title: 'Important Warning',
                message: `
                    Some of the data from the spider may be wrong. <strong class="text-white">DO NOT simply update ${escapeHtml(currentState.tag)} on all of the objects.</strong>
                    Check the history to see who added ${escapeHtml(currentState.tag)} and their likely source.
                    If you are not sure then <strong class="text-white">DO NOT MAKE A CHANGE</strong> unless you can survey the place.
                `,
                onUnderstand: () => {
                    const warnedTags = JSON.parse(sessionStorage.getItem(`mismatch_warned_tags_${spiderName}`) || '[]');
                    if (!warnedTags.includes(currentState.tag)) {
                        warnedTags.push(currentState.tag);
                        sessionStorage.setItem(`mismatch_warned_tags_${spiderName}`, JSON.stringify(warnedTags));
                    }
                    hideMismatchWarning();
                },
            });
            return true;
        }
        return false;
    }

    function hideMismatchWarning() {
        document.getElementById('mismatch-modal').classList.add('hidden');
        document.getElementById('modal-backdrop').classList.add('hidden');
    }

    function updateFadeEffect(container) {
        const wrapper = container.parentElement;
        if (!wrapper.classList.contains('fade-wrapper')) return;

        const scrollLeft = container.scrollLeft;
        const scrollWidth = container.scrollWidth;
        const clientWidth = container.clientWidth;

        const isScrollable = scrollWidth > clientWidth;
        const atStart = scrollLeft <= 1;
        const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;

        wrapper.classList.remove('fade-left', 'fade-right', 'fade-both');

        if (isScrollable) {
            if (!atStart && !atEnd) {
                wrapper.classList.add('fade-both');
            } else if (!atStart) {
                wrapper.classList.add('fade-left');
            } else if (!atEnd) {
                wrapper.classList.add('fade-right');
            }
        }
    }

    function initFading() {
        const scrollContainers = document.querySelectorAll('.overflow-x-auto.no-scrollbar');
        scrollContainers.forEach(container => {
            container.addEventListener('scroll', () => updateFadeEffect(container));
            // Initial check and also on resize
            updateFadeEffect(container);
            new ResizeObserver(() => updateFadeEffect(container)).observe(container);
        });
    }

    function render() {
        const visited = getVisitedLinks(atpDate);
        const visitedSet = new Set(visited.links);

        if (showMismatchWarning()) {
            // Modal is shown, we can still render the background if we want,
            // but the user must interact with the modal first.
        }

        const isUniquelyMatched = r =>
            r.matchCount === 1 && !['disallowed source uri', 'not a brand spider'].includes(r.status);
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

        // Hide all counts first
        document.querySelectorAll('#tag-tabs .tab-count').forEach(el => el.classList.add('hidden'));

        // Update Content visibility
        document.querySelectorAll('[role="tabpanel"]').forEach(panel => {
            panel.classList.toggle('hidden', panel.id !== `${currentState.tag}-content`);
        });

        if (currentState.tag === 'summary') return;

        if (currentState.tag === 'unmapped') {
            renderUnmapped();
            return;
        }

        if (currentState.tag === 'unmatched') {
            renderUnmatched();
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

        const showOsmColumns = currentState.status !== 'Add to OSM';

        thead.innerHTML = `
            <tr class="hidden md:table-row">
                <th class="px-4 py-3">Ref</th>
                <th class="px-4 py-3">Spider Value</th>
                ${showOsmColumns ? '<th class="px-4 py-3">OSM Value</th>' : ''}
                <th class="px-4 py-3 text-right">OSM</th>
            </tr>
        `;

        const tbody = table.querySelector('tbody');
        tbody.innerHTML = pageData
            .map(r => {
                const suggestedFixes = {};
                if (r.tagStatus === 'Add to OSM' || r.tagStatus === 'update OSM') {
                    suggestedFixes[currentState.tag] = r.spiderValue;
                } else if (r.tagStatus === 'mismatch' && currentState.status === 'mismatch') {
                    suggestedFixes[currentState.tag] = r.spiderValue;
                }

                const refDisplay = escapeHtml(r.ref);

                return `
            <tr class="flex flex-col md:table-row border-b border-gray-800 md:border-none p-4 md:p-0 hover:bg-gray-800 transition-colors">
                <td class="md:table-cell md:px-4 md:py-3 font-medium break-all mb-2 md:mb-0">
                    <div class="text-lg md:text-base flex items-center flex-wrap">
                        ${refDisplay}
                        ${renderStatusLabel(r.tagStatus)}
                    </div>
                </td>
                <td class="md:table-cell md:px-4 md:py-3 mb-2 md:mb-0">
                    <div class="flex md:block">
                        <span class="md:hidden font-bold text-gray-400 w-16 shrink-0 text-sm">Spider:</span>
                        <div class="flex-grow">${renderSpiderValue(r.spiderValue, r.history, currentState.tag, visitedSet)}</div>
                    </div>
                </td>
                ${
                    showOsmColumns
                        ? `
                <td class="md:table-cell md:px-4 md:py-3 mb-2 md:mb-0">
                    <div class="flex md:block">
                        <span class="md:hidden font-bold text-gray-400 w-16 shrink-0 text-sm">OSM:</span>
                        <div class="flex-grow">${renderTagValue(r.osmValue, currentState.tag, visitedSet)}</div>
                    </div>
                </td>`
                        : ''
                }
                <td class="md:table-cell md:px-4 md:py-3 md:text-right">
                    ${renderOsmColumn(r.osmId, suggestedFixes, visitedSet)}
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

    async function renderUnmapped() {
        const visited = getVisitedLinks(atpDate);
        const visitedSet = new Set(visited.links);
        const table = document.getElementById('unmapped-table');
        const loading = document.getElementById('unmapped-loading');

        if (!unmappedCache) {
            table.classList.add('hidden');
            loading.classList.remove('hidden');
            try {
                const response = await fetch(`./${spiderName}_unmapped.json`);
                unmappedCache = await response.json();
            } catch (e) {
                console.error('Failed to load unmapped data', e);
                unmappedCache = [];
            }
            loading.classList.add('hidden');
            table.classList.remove('hidden');
        }

        const disallowedOrNotBrand = results.filter(r =>
            ['disallowed source uri', 'not a brand spider'].includes(r.status)
        );
        const allUnmapped = [...disallowedOrNotBrand, ...unmappedCache];

        const totalPages = Math.ceil(allUnmapped.length / PAGE_SIZE) || 1;
        if (currentState.page > totalPages) currentState.page = totalPages;

        // Show count on tab
        const tabCount = document.querySelector('#unmapped-tab .tab-count');
        if (tabCount) {
            tabCount.textContent = `(${allUnmapped.length})`;
            tabCount.classList.remove('hidden');
        }

        const start = (currentState.page - 1) * PAGE_SIZE;
        const pageData = allUnmapped.slice(start, start + PAGE_SIZE);

        const tbody = table.querySelector('tbody');
        tbody.innerHTML = pageData
            .map(
                r => `
            <tr class="flex flex-col md:table-row border-b border-gray-800 md:border-none p-4 md:p-0 hover:bg-gray-800 transition-colors">
                <td class="md:table-cell md:px-4 md:py-3 font-medium break-all mb-2 md:mb-0">
                    <div class="text-lg md:text-base flex items-center flex-wrap">
                        ${escapeHtml(r.ref)}
                        ${renderStatusLabel(r.status)}
                    </div>
                </td>
                <td class="md:table-cell md:px-4 md:py-3">
                    <div class="flex md:block">
                        <span class="md:hidden font-bold text-gray-400 w-16 shrink-0 text-sm">Tags:</span>
                        <div class="text-xs font-mono whitespace-pre-wrap flex-grow">${renderTagsWithLinks(r.allAtpTags, visitedSet)}</div>
                    </div>
                </td>
            </tr>
        `
            )
            .join('');

        const pagination = document.getElementById('unmapped-pagination');
        pagination.querySelector('.page-info').textContent = `Page ${currentState.page} of ${totalPages}`;
        pagination.querySelector('.prev-btn').disabled = currentState.page === 1;
        pagination.querySelector('.next-btn').disabled = currentState.page === totalPages || allUnmapped.length === 0;
    }

    async function renderUnmatched() {
        const visited = getVisitedLinks(atpDate);
        const visitedSet = new Set(visited.links);
        const table = document.getElementById('unmatched-table');
        const loading = document.getElementById('unmatched-loading');

        if (!unmatchedCache) {
            table.classList.add('hidden');
            loading.classList.remove('hidden');
            try {
                const response = await fetch(`./${spiderName}_unmatched.json`);
                unmatchedCache = await response.json();
            } catch (e) {
                console.error('Failed to load unmatched data', e);
                unmatchedCache = [];
            }
            loading.classList.add('hidden');
            table.classList.remove('hidden');
        }

        const totalPages = Math.ceil(unmatchedCache.length / PAGE_SIZE) || 1;
        if (currentState.page > totalPages) currentState.page = totalPages;

        // Show count on tab
        const tabCount = document.querySelector('#unmatched-tab .tab-count');
        if (tabCount) {
            tabCount.textContent = `(${unmatchedCache.length})`;
            tabCount.classList.remove('hidden');
        }

        const start = (currentState.page - 1) * PAGE_SIZE;
        const pageData = unmatchedCache.slice(start, start + PAGE_SIZE);

        const tbody = table.querySelector('tbody');
        tbody.innerHTML = pageData
            .map(
                r => `
            <tr class="flex flex-col md:table-row border-b border-gray-800 md:border-none p-4 md:p-0 hover:bg-gray-800 transition-colors">
                <td class="md:table-cell md:px-4 md:py-3 font-medium break-all mb-2 md:mb-0">
                    <div class="text-lg md:text-base flex items-center flex-wrap">
                        ${escapeHtml(r.id)}
                    </div>
                </td>
                <td class="md:table-cell md:px-4 md:py-3">
                    <div class="flex md:block">
                        <span class="md:hidden font-bold text-gray-400 w-16 shrink-0 text-sm">Tags:</span>
                        <div class="text-xs font-mono whitespace-pre-wrap flex-grow">${renderTagsWithLinks(r.tags, visitedSet)}</div>
                    </div>
                </td>
                <td class="md:table-cell md:px-4 md:py-3 md:text-right">
                    ${renderOsmColumn(r.id, {}, visitedSet)}
                </td>
            </tr>
        `
            )
            .join('');

        const pagination = document.getElementById('unmatched-pagination');
        pagination.querySelector('.page-info').textContent = `Page ${currentState.page} of ${totalPages}`;
        pagination.querySelector('.prev-btn').disabled = currentState.page === 1;
        pagination.querySelector('.next-btn').disabled =
            currentState.page === totalPages || unmatchedCache.length === 0;

        // Render bulk JOSM links
        const bulkContainer = document.getElementById('unmatched-bulk-josm-container');
        const bulkLinksEl = document.getElementById('unmatched-bulk-josm-links');

        if (unmatchedCache.length > 0) {
            bulkContainer.classList.remove('hidden');
            const links = [];
            const BATCH_SIZE = 100;

            for (let i = 0; i < unmatchedCache.length; i += BATCH_SIZE) {
                const batch = unmatchedCache.slice(i, i + BATCH_SIZE);
                const objects = batch.map(r => r.id[0] + r.id.substring(1)).join(',');
                const josmUrl = `http://127.0.0.1:8111/load_object?objects=${objects}&relation_members=true`;
                const label = `(${i + 1}-${Math.min(i + BATCH_SIZE, unmatchedCache.length)})`;

                links.push(`
                    <a href="javascript:void(0)" onclick="handleJosmLink('${josmUrl}')" class="text-blue-400 hover:underline text-sm">
                        ${label}
                    </a>
                `);
            }
            bulkLinksEl.innerHTML = links.join('');
        } else {
            bulkContainer.classList.add('hidden');
        }
    }

    function renderDuplicates() {
        const visited = getVisitedLinks(atpDate);
        const visitedSet = new Set(visited.links);
        const duplicates = results.filter(r => r.matchCount > 1);
        const totalPages = Math.ceil(duplicates.length / PAGE_SIZE) || 1;
        if (currentState.page > totalPages) currentState.page = totalPages;

        const start = (currentState.page - 1) * PAGE_SIZE;
        const pageData = duplicates.slice(start, start + PAGE_SIZE);

        const tbody = document.querySelector('#duplicate-refs-table tbody');
        tbody.innerHTML = pageData
            .map(
                r => `
            <tr class="flex flex-col md:table-row border-b border-gray-800 md:border-none p-4 md:p-0 hover:bg-gray-800 transition-colors">
                <td class="md:table-cell md:px-4 md:py-3 font-medium break-all mb-2 md:mb-0">
                    <div class="text-lg md:text-base flex items-center flex-wrap">
                        ${escapeHtml(r.ref)}
                        ${renderStatusLabel(`${r.status} (${r.matchCount} matches)`)}
                    </div>
                </td>
                <td class="md:table-cell md:px-4 md:py-3">
                    <div class="flex md:block">
                        <span class="md:hidden font-bold text-gray-400 w-16 shrink-0 text-sm">Tags:</span>
                        <div class="text-xs font-mono whitespace-pre-wrap flex-grow">${renderTagsWithLinks(r.allAtpTags, visitedSet)}</div>
                    </div>
                </td>
            </tr>
        `
            )
            .join('');

        const pagination = document.getElementById('duplicate-refs-pagination');
        pagination.querySelector('.page-info').textContent = `Page ${currentState.page} of ${totalPages}`;
        pagination.querySelector('.prev-btn').disabled = currentState.page === 1;
        pagination.querySelector('.next-btn').disabled = currentState.page === totalPages || duplicates.length === 0;
    }

    function renderOsmColumn(osmId, suggestedFixes = {}, visitedSet = new Set()) {
        if (!osmId) return '';
        const typeMap = { n: 'node', w: 'way', r: 'relation' };
        const typeChar = osmId.toString()[0];
        const osmType = typeMap[typeChar];
        const id = osmId.toString().substring(1);
        if (!osmType) return '';

        const osmUrl = `https://www.openstreetmap.org/${osmType}/${id}`;
        const isOsmVisited = visitedSet.has(osmUrl);

        const josmFixBaseUrl = 'http://127.0.0.1:8111/load_object';
        const josmEditUrl = `${josmFixBaseUrl}?objects=${osmType[0]}${id}&relation_members=true`;
        const isJosmEditVisited = visitedSet.has(josmEditUrl);

        const encodedTags = Object.entries(suggestedFixes).map(([key, value]) => {
            const encodedKey = encodeURIComponent(key);
            const encodedValue = value ? encodeURIComponent(value) : '';
            return `${encodedKey}=${encodedValue}`;
        });

        const addtagsValue = encodedTags.join(encodeURIComponent('|'));
        const josmUpdateUrl = `${josmEditUrl}&addtags=${addtagsValue}`;
        const isJosmUpdateVisited = visitedSet.has(josmUpdateUrl);

        const hasFixes = Object.keys(suggestedFixes).length > 0;
        return `
            <div class="flex flex-col md:items-end gap-1 mt-2 md:mt-0 pt-2 md:pt-0 border-t border-gray-800 md:border-none">
                <div class="flex items-center gap-4 md:flex-col md:items-end md:gap-1">
                    <a href="${osmUrl}" target="_blank" data-link-type="osm" class="inline-flex items-center ${isOsmVisited ? 'text-gray-600' : 'text-blue-400'} hover:underline">
                        <span>${osmId}</span>
                        <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    </a>
                    <div class="text-xs text-gray-500">
                        <a href="javascript:void(0)" onclick="handleJosmLink('${josmEditUrl}')" class="${isJosmEditVisited ? 'text-gray-600' : 'text-blue-400'} hover:underline">edit</a>
                        ${hasFixes ? `<a href="javascript:void(0)" onclick="handleJosmLink('${josmUpdateUrl}')" class="${isJosmUpdateVisited ? 'text-gray-600' : 'text-blue-400'} hover:underline ml-1">update</a>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // Event Listeners
    document.addEventListener('click', e => {
        const link = e.target.closest('a[data-link-type="osm"], a[data-link-type="website"]');
        if (link) {
            markLinkVisited(link.href, atpDate);
            render();
        }
    });

    document.addEventListener('auxclick', e => {
        const link = e.target.closest('a[data-link-type="osm"], a[data-link-type="website"]');
        if (link && e.button === 1) {
            markLinkVisited(link.href, atpDate);
            render();
        }
    });

    document.getElementById('tag-tabs').addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        currentState.tag = btn.dataset.tab;
        currentState.status = null;
        currentState.page = 1;
        updateUrl();
        render();
    });

    window.handleJosmLink = function (url) {
        handleJosmLink(url, atpDate, render);
    };

    importableTags.forEach(tag => {
        const panel = document.getElementById(`${tag}-content`);
        if (!panel) return;

        // Status filter listeners
        const statusFilters = panel.querySelector(`[id="${tag}-status-filters"]`);
        if (!statusFilters) return;
        statusFilters.addEventListener('click', e => {
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

    // Unmatched pagination
    const unmatchedPagination = document.getElementById('unmatched-pagination');
    if (unmatchedPagination) {
        unmatchedPagination.querySelector('.prev-btn').onclick = () => {
            if (currentState.page > 1) {
                currentState.page--;
                updateUrl();
                render();
            }
        };
        unmatchedPagination.querySelector('.next-btn').onclick = () => {
            currentState.page++;
            updateUrl();
            render();
        };
    }

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

    document.getElementById('open-unmapped-josm').onclick = () => {
        showModal({
            title: 'JOSM Import Warning',
            message:
                'This will load and open the unmapped items from ATP into JOSM. This may be useful to match them to existing elements. <strong class="text-white">DO NOT import them</strong>, but use conflation and judgement.',
            showImportBtn: true,
            onUnderstand: () => {
                // Button switching handled in showModal
            },
        });
    };

    document.getElementById('mismatch-import-btn').onclick = () => {
        const geojsonUrl = new URL(`${spiderName}_unmapped.geojson`, window.location.href).href;
        const josmUrl = `http://127.0.0.1:8111/import?new_layer=true&upload_policy=false&url=${encodeURIComponent(geojsonUrl)}`;
        handleJosmLink(josmUrl);
        hideMismatchWarning();
    };

    document.getElementById('mismatch-back-btn').onclick = () => {
        currentState.status = null;
        updateUrl();
        hideMismatchWarning();
        render();
    };

    document.getElementById('modal-backdrop').onclick = () => {
        const mismatchModal = document.getElementById('mismatch-modal');
        const josmModal = document.getElementById('josm-modal');

        if (!mismatchModal.classList.contains('hidden')) {
            document.getElementById('mismatch-back-btn').click();
        } else if (josmModal && !josmModal.classList.contains('hidden')) {
            josmModal.classList.add('hidden');
            document.getElementById('modal-backdrop').classList.add('hidden');
        }
    };

    // Initial load
    loadStateFromUrl();
    initFading();
    render();
}
