import { render, h } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
import { Header, Layout } from './components/Layout';

const PAGE_SIZE = 10;

function Dashboard({ allSpiderResults, atpDate, osmDate }) {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    // Load state from URL hash
    useEffect(() => {
        const loadState = () => {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const s = params.get('search') || '';
            const p = parseInt(params.get('page')) || 1;
            setSearch(s);
            setPage(p);
        };

        loadState();
        window.addEventListener('popstate', loadState);
        return () => window.removeEventListener('popstate', loadState);
    }, []);

    // Update URL hash
    useEffect(() => {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (page > 1) params.set('page', page);

        const newHash = params.toString();
        if (window.location.hash.substring(1) !== newHash) {
            window.history.pushState({}, '', `${window.location.pathname}${window.location.search}${newHash ? '#' + newHash : ''}`);
        }
    }, [search, page]);

    const filtered = useMemo(() => {
        return allSpiderResults.filter(spider =>
            spider.name.toLowerCase().includes(search.toLowerCase())
        );
    }, [allSpiderResults, search]);

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
    const effectivePage = Math.min(page, totalPages);

    const pageData = useMemo(() => {
        const start = (effectivePage - 1) * PAGE_SIZE;
        return filtered.slice(start, start + PAGE_SIZE);
    }, [filtered, effectivePage]);

    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        setPage(1);
    };

    return (
        <Layout atpDate={atpDate} osmDate={osmDate}>
            <Header title="ATP-OSM Sync" subtitle="Data synchronization between All The Places and OpenStreetMap" />

            <div class="space-y-6">
                <div class="relative max-w-md">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg class="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        id="search-input"
                        class="block w-full pl-10 pr-3 py-2 border border-gray-700 rounded-lg leading-5 bg-gray-900 text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                        placeholder="Search spiders..."
                        value={search}
                        onInput={handleSearchChange}
                    />
                </div>

                <div class="bg-gray-900 rounded-xl shadow-2xl overflow-hidden border border-gray-800">
                    <table class="min-w-full">
                        <thead class="bg-gray-800 text-gray-400 text-left uppercase text-sm tracking-wider hidden md:table-header-group">
                            <tr>
                                <th class="px-6 py-4 w-10"></th>
                                <th class="px-6 py-4">Spider Name</th>
                                <th class="px-6 py-4 text-right whitespace-nowrap">Issues / Mapped</th>
                                <th class="px-6 py-4 text-right whitespace-nowrap">Automatic Updates</th>
                                <th class="px-6 py-4 text-right whitespace-nowrap">Mapped / Total</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-800">
                            {pageData.map(spider => (
                                <SpiderRow key={spider.name} spider={spider} />
                            ))}
                        </tbody>
                    </table>
                </div>

                <div class="mt-6 flex items-center justify-between">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={effectivePage === 1}
                        class="px-4 py-2 bg-gray-800 text-gray-300 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer text-sm font-medium"
                    >
                        Previous
                    </button>
                    <span class="text-gray-400 font-medium text-sm">
                        Page {effectivePage} of {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={effectivePage === totalPages || filtered.length === 0}
                        class="px-4 py-2 bg-gray-800 text-gray-300 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer text-sm font-medium"
                    >
                        Next
                    </button>
                </div>
            </div>
        </Layout>
    );
}

function SpiderRow({ spider }) {
    const {
        name,
        issuesCount,
        mappedCount,
        totalCount,
        automaticUpdatesCount,
        isBrandSpider,
        stabilityColor,
        loadStatus,
    } = spider;

    const statusColors = {
        green: 'bg-green-500',
        orange: 'bg-orange-500',
        red: 'bg-red-500',
        gray: 'bg-gray-600',
    };

    const statusTitles = {
        green: 'Stable',
        orange: 'Minor variations',
        red: 'Major variations',
        gray: 'Missing data',
    };

    const showTotals = !loadStatus && isBrandSpider;

    return (
        <tr
            class="flex flex-col md:table-row border-b border-gray-800 md:border-gray-700 hover:bg-gray-800 cursor-pointer p-4 md:p-0"
            onClick={() => window.location.href = `${name}/`}
        >
            <td class="md:table-cell md:px-6 md:py-4 mb-2 md:mb-0">
                <div class="flex items-center gap-2">
                    <div
                        class={`w-3 h-3 rounded-full ${statusColors[stabilityColor] || 'bg-gray-600'}`}
                        title={statusTitles[stabilityColor]}
                    />
                    <div class="md:hidden">
                        <a
                            href={`${name}/`}
                            class="text-blue-400 hover:underline font-bold text-base"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {name}
                        </a>
                        {loadStatus && (
                            <span class="ml-2 px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-400">
                                {loadStatus}
                            </span>
                        )}
                    </div>
                </div>
            </td>
            <td class="hidden md:table-cell md:px-6 md:py-4">
                <a
                    href={`${name}/`}
                    class="text-blue-400 hover:underline font-bold text-lg"
                    onClick={(e) => e.stopPropagation()}
                >
                    {name}
                </a>
                {loadStatus && (
                    <span class="ml-2 px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-400">
                        {loadStatus}
                    </span>
                )}
            </td>
            <td class="md:table-cell md:px-6 md:py-4 md:text-right">
                <div class="grid grid-cols-3 md:block">
                    <div class="flex flex-col md:block">
                        <div class="text-sm md:text-base">
                            <span class={`${issuesCount > 0 ? 'text-red-400' : 'text-green-400'} font-semibold`}>
                                {showTotals ? issuesCount : ''}
                            </span>
                            <span class="text-gray-500">{showTotals ? ` / ${mappedCount}` : ''}</span>
                        </div>
                        <div class="md:hidden text-[10px] text-gray-500 uppercase tracking-tighter leading-none whitespace-nowrap mt-1">
                            (Issues / Mapped)
                        </div>
                    </div>
                    <div class="flex flex-col md:hidden">
                        <div class="text-sm">
                            <span class="text-blue-400 font-semibold">
                                {showTotals ? automaticUpdatesCount : ''}
                            </span>
                        </div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-tighter leading-none whitespace-nowrap mt-1">
                            (Auto Updates)
                        </div>
                    </div>
                    <div class="flex flex-col md:hidden text-right">
                        <div class="text-sm">
                            <span class="text-gray-200 font-semibold">
                                {showTotals ? mappedCount : ''}
                            </span>
                            <span class="text-gray-500">{showTotals ? ` / ${totalCount}` : ''}</span>
                        </div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-tighter leading-none whitespace-nowrap mt-1">
                            (Mapped / Total)
                        </div>
                    </div>
                </div>
            </td>
            <td class="hidden md:table-cell md:px-6 md:py-4 md:text-right">
                <div class="text-sm md:text-base">
                    <span class="text-blue-400 font-semibold">
                        {showTotals ? automaticUpdatesCount : ''}
                    </span>
                </div>
            </td>
            <td class="hidden md:table-cell md:px-6 md:py-4 md:text-right">
                <div>
                    <span class="text-gray-200 font-semibold">
                        {showTotals ? mappedCount : ''}
                    </span>
                    <span class="text-gray-500">{showTotals ? ` / ${totalCount}` : ''}</span>
                </div>
            </td>
        </tr>
    );
}

window.initIndexDashboard = (props) => {
    const container = document.getElementById('index-dashboard-root');
    if (container) {
        render(<Dashboard {...props} />, container);
    }
};
