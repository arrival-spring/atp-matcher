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
            const issuesCount = spider.results.filter(r => r.status !== 'matching').length;
            const totalCount = spider.results.length;
            const mappedCount = spider.results.filter(r => r.isMapped).length;
            const name = spider.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

            return `
                <tr class="border-b border-gray-700 hover:bg-gray-800 cursor-pointer" onclick="window.location='${name}.html'">
                    <td class="px-6 py-4">
                        <a href="${name}.html" class="text-blue-400 hover:underline font-bold text-lg" onclick="event.stopPropagation()">${name}</a>
                    </td>
                    <td class="px-6 py-4">
                        <span class="${issuesCount > 0 ? 'text-red-400' : 'text-green-400'} font-semibold">
                            ${issuesCount}
                        </span>
                        <span class="text-gray-500"> / ${totalCount}</span>
                    </td>
                    <td class="px-6 py-4">
                        <span class="text-gray-200 font-semibold">
                            ${mappedCount}
                        </span>
                        <span class="text-gray-500"> / ${totalCount}</span>
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
