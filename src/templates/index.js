export function initDashboard(allSpiderResults) {
    const PAGE_SIZE = 10;
    let currentState = {
        search: '',
        page: 1,
    };

    function updateUrl(replace = false) {
        const url = new URL(window.location);
        url.hash = `${currentState.search ? `search=${encodeURIComponent(currentState.search)}` : ''}${currentState.page > 1 ? `${currentState.search ? '&' : ''}page=${currentState.page}` : ''}`;
        if (replace) {
            window.history.replaceState({}, '', url);
        } else {
            window.history.pushState({}, '', url);
        }
    }

    function loadStateFromUrl() {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        currentState.search = params.get('search') || '';
        currentState.page = parseInt(params.get('page')) || 1;
        document.getElementById('search-input').value = currentState.search;
    }

    function render() {
        const filtered = allSpiderResults.filter(spider =>
            spider.name.toLowerCase().includes(currentState.search.toLowerCase())
        );

        const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
        if (currentState.page > totalPages) currentState.page = totalPages;

        const start = (currentState.page - 1) * PAGE_SIZE;
        const pageData = filtered.slice(start, start + PAGE_SIZE);

        const tbody = document.getElementById('dashboard-tbody');
        tbody.innerHTML = pageData.map(spider => {
            const { name: rawName, issuesCount, mappedCount, totalCount, automaticUpdatesCount, isBrandSpider } = spider;
            const name = rawName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

            let statusIcon = '';
            if (spider.stabilityColor === 'green') {
                statusIcon = '<div class="w-3 h-3 rounded-full bg-green-500" title="Stable"></div>';
            } else if (spider.stabilityColor === 'orange') {
                statusIcon = '<div class="w-3 h-3 rounded-full bg-orange-500" title="Minor variations"></div>';
            } else if (spider.stabilityColor === 'red') {
                statusIcon = '<div class="w-3 h-3 rounded-full bg-red-500" title="Major variations"></div>';
            } else if (spider.stabilityColor === 'gray') {
                statusIcon = '<div class="w-3 h-3 rounded-full bg-gray-600" title="Missing data"></div>';
            }

            const loadStatusLabel = spider.loadStatus ? `<span class="ml-2 px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-400">${spider.loadStatus}</span>` : '';

            const showTotals = !spider.loadStatus && isBrandSpider;

            return `
                <tr class="flex flex-col md:table-row border-b border-gray-800 md:border-gray-700 hover:bg-gray-800 cursor-pointer p-4 md:p-0" onclick="window.location='${name}.html'">
                    <td class="md:table-cell md:px-6 md:py-4 mb-2 md:mb-0">
                        <div class="flex items-center gap-2">
                            ${statusIcon}
                            <div class="md:hidden">
                                <a href="${name}.html" class="text-blue-400 hover:underline font-bold text-base" onclick="event.stopPropagation()">${name}</a>
                                ${loadStatusLabel}
                            </div>
                        </div>
                    </td>
                    <td class="hidden md:table-cell md:px-6 md:py-4">
                        <a href="${name}.html" class="text-blue-400 hover:underline font-bold text-lg" onclick="event.stopPropagation()">${name}</a>
                        ${loadStatusLabel}
                    </td>
                    <td class="md:table-cell md:px-6 md:py-4 md:text-right">
                        <div class="flex justify-between md:block">
                            <div class="text-sm md:text-base">
                                <span class="${issuesCount > 0 ? 'text-red-400' : 'text-green-400'} font-semibold">
                                    ${showTotals ? issuesCount : ''}
                                </span>
                                <span class="text-gray-500">${showTotals ? ` / ${mappedCount}` : ''}</span>
                            </div>
                            <div class="md:hidden text-right">
                                <span class="text-blue-400 font-semibold text-sm">
                                    ${showTotals ? automaticUpdatesCount : ''}
                                </span>
                            </div>
                        </div>
                        <div class="flex justify-between md:justify-end gap-4 mt-1">
                            <span class="text-[10px] text-gray-500 uppercase tracking-tighter leading-none whitespace-nowrap">(Issues / Mapped)</span>
                            <span class="md:hidden text-[10px] text-gray-500 uppercase tracking-tighter leading-none whitespace-nowrap">(Auto Updates)</span>
                        </div>
                    </td>
                    <td class="hidden md:table-cell md:px-6 md:py-4 md:text-right">
                        <div class="text-sm md:text-base">
                            <span class="text-blue-400 font-semibold">
                                ${showTotals ? automaticUpdatesCount : ''}
                            </span>
                        </div>
                        <div class="flex justify-end gap-4 mt-1 text-[10px] text-gray-500 uppercase tracking-tighter leading-none whitespace-nowrap">(Auto Updates)</div>
                    </td>
                    <td class="hidden md:table-cell md:px-6 md:py-4 md:text-right">
                        <div>
                            <span class="text-gray-200 font-semibold">
                                ${showTotals ? mappedCount : ''}
                            </span>
                            <span class="text-gray-500">${showTotals ? ` / ${totalCount}` : ''}</span>
                        </div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-tighter mt-1 leading-none whitespace-nowrap">(Mapped / Total)</div>
                    </td>
                </tr>
            `;
        }).join('');

        // Update Pagination
        const pagination = document.getElementById('pagination');
        pagination.querySelector('.page-info').textContent = `Page ${currentState.page} of ${totalPages}`;
        pagination.querySelector('.prev-btn').disabled = currentState.page === 1;
        pagination.querySelector('.next-btn').disabled = currentState.page === totalPages || filtered.length === 0;
    }

    document.getElementById('search-input').addEventListener('input', e => {
        currentState.search = e.target.value;
        currentState.page = 1;
        updateUrl(true);
        render();
    });

    const pagination = document.getElementById('pagination');
    pagination.querySelector('.prev-btn').onclick = () => {
        if (currentState.page > 1) {
            currentState.page--;
            updateUrl();
            render();
        }
    };
    pagination.querySelector('.next-btn').onclick = () => {
        const filtered = allSpiderResults.filter(spider =>
            spider.name.toLowerCase().includes(currentState.search.toLowerCase())
        );
        const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
        if (currentState.page < totalPages) {
            currentState.page++;
            updateUrl();
            render();
        }
    };

    window.onpopstate = () => {
        loadStateFromUrl();
        render();
    };

    loadStateFromUrl();
    render();
}
