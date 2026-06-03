export function initDashboard(allSpiderResults) {
    const PAGE_SIZE = 10;
    let currentState = {
        search: '',
        page: 1
    };

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
            const isMapped = r => r.matchCount >= 1 && r.status !== 'disallowed source uri';
            const mappedResults = (spider.results || []).filter(isMapped);
            const issuesCount = mappedResults.filter(r => r.status !== 'matching').length;
            const totalCount = (spider.results || []).length;
            const mappedCount = mappedResults.length;
            const name = spider.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

            return `
                <tr class="border-b border-gray-700 hover:bg-gray-800 cursor-pointer" onclick="window.location='${name}.html'">
                    <td class="px-6 py-4">
                        ${statusIcon}
                    </td>
                    <td class="px-6 py-4">
                        <a href="${name}.html" class="text-blue-400 hover:underline font-bold text-lg" onclick="event.stopPropagation()">${name}</a>
                        ${loadStatusLabel}
                    </td>
                    <td class="px-6 py-4">
                        <span class="${issuesCount > 0 ? 'text-red-400' : 'text-green-400'} font-semibold">
                            ${spider.loadStatus ? '-' : issuesCount}
                        </span>
                        <span class="text-gray-500"> / ${spider.loadStatus ? '-' : mappedCount}</span>
                    </td>
                    <td class="px-6 py-4">
                        <span class="text-gray-200 font-semibold">
                            ${spider.loadStatus ? '-' : mappedCount}
                        </span>
                        <span class="text-gray-500"> / ${spider.loadStatus ? '-' : totalCount}</span>
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

    document.getElementById('search-input').addEventListener('input', (e) => {
        currentState.search = e.target.value;
        currentState.page = 1;
        render();
    });

    const pagination = document.getElementById('pagination');
    pagination.querySelector('.prev-btn').onclick = () => {
        if (currentState.page > 1) {
            currentState.page--;
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
            render();
        }
    };

    render();
}
