import { render, h } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
import { escapeHtml } from './utils';
import { t, initI18n } from './i18n';
import { LanguageSwitcher } from './components/LanguageSwitcher';

const PAGE_SIZE = 10;

function Dashboard({ allSpiderResults }) {
    const [currentLocale, setCurrentLocale] = useState(null);

    useEffect(() => {
        const handleLocaleChange = (e) => setCurrentLocale(e.detail);
        window.addEventListener('localeChanged', handleLocaleChange);
        return () => window.removeEventListener('localeChanged', handleLocaleChange);
    }, []);

    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ column: null, direction: 'desc' });

    // Load state from URL hash
    useEffect(() => {
        const loadState = () => {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const s = params.get('search') || '';
            const p = parseInt(params.get('page')) || 1;
            const sortCol = params.get('sort');
            const sortDir = params.get('dir') || 'desc';
            setSearch(s);
            setPage(p);
            if (sortCol) setSort({ column: sortCol, direction: sortDir });
        };

        loadState();
        window.addEventListener('popstate', loadState);
        return () => window.removeEventListener('popstate', loadState);
    }, []);

    // Update URL hash
    useEffect(() => {
        const url = new URL(window.location);
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (page > 1) params.set('page', page);
        if (sort.column) {
            params.set('sort', sort.column);
            params.set('dir', sort.direction);
        }

        const newHash = params.toString();
        if (window.location.hash.substring(1) !== newHash) {
            window.history.pushState({}, '', `${url.pathname}${url.search}${newHash ? '#' + newHash : ''}`);
        }
    }, [search, page, sort]);

    const handleSort = (column) => {
        let direction = column === 'name' ? 'asc' : 'desc';
        if (sort.column === column) {
            direction = sort.direction === 'desc' ? 'asc' : 'desc';
        }
        setSort({ column, direction });
        setPage(1);
    };

    const filtered = useMemo(() => {
        let data = allSpiderResults.filter(spider => spider.name.toLowerCase().includes(search.toLowerCase()));

        if (sort.column) {
            data.sort((a, b) => {
                let valA, valB, secondaryA, secondaryB;

                switch (sort.column) {
                    case 'status':
                        valA = a.stabilityScore;
                        valB = b.stabilityScore;
                        break;
                    case 'name':
                        valA = a.name;
                        valB = b.name;
                        break;
                    case 'issues':
                        valA = a.issuesCount;
                        valB = b.issuesCount;
                        secondaryA = a.mappedCount;
                        secondaryB = b.mappedCount;
                        break;
                    case 'updates':
                        valA = a.automaticUpdatesCount;
                        valB = b.automaticUpdatesCount;
                        break;
                    case 'mapped':
                        valA = a.mappedCount;
                        valB = b.mappedCount;
                        secondaryA = a.totalCount;
                        secondaryB = b.totalCount;
                        break;
                    default:
                        return 0;
                }

                if (valA === valB && secondaryA !== undefined) {
                    valA = secondaryA;
                    valB = secondaryB;
                }

                if (valA < valB) return sort.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sort.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return data;
    }, [allSpiderResults, search, sort]);

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
    const effectivePage = Math.min(page, totalPages);

    const pageData = useMemo(() => {
        const start = (effectivePage - 1) * PAGE_SIZE;
        return filtered.slice(start, start + PAGE_SIZE);
    }, [filtered, effectivePage]);

    const handleSearchChange = e => {
        setSearch(e.target.value);
        setPage(1);
    };

    return (
        <div class="space-y-6">
            <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg class="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                    </svg>
                </div>
                <input
                    type="text"
                    id="search-input"
                    class="block w-full pl-10 pr-3 py-3 border border-gray-700 rounded-lg leading-5 bg-gray-900 text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                    placeholder={t('index.searchPlaceholder')}
                    value={search}
                    onInput={handleSearchChange}
                />
            </div>

            <div class="overflow-x-auto md:overflow-x-visible bg-gray-900 rounded-lg shadow">
                <table class="min-w-full table-auto">
                    <thead class="bg-gray-800 text-gray-400 text-left">
                        <tr class="hidden md:table-row">
                            <th
                                class="px-6 py-3 text-xs font-medium uppercase tracking-wider w-16 cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('status')}
                            >
                                <div class="flex items-center gap-1">
                                    {t('index.table.status')}
                                    <SortIcon column="status" currentSort={sort} />
                                </div>
                            </th>
                            <th
                                class="px-6 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('name')}
                            >
                                <div class="flex items-center gap-1">
                                    {t('index.table.spiderName')}
                                    <SortIcon column="name" currentSort={sort} />
                                </div>
                            </th>
                            <th
                                class="px-6 py-3 text-xs font-medium uppercase tracking-wider text-right cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('issues')}
                            >
                                <div class="flex items-center justify-end gap-1">
                                    {t('index.table.issuesMapped')}
                                    <SortIcon column="issues" currentSort={sort} />
                                </div>
                            </th>
                            <th
                                class="px-6 py-3 text-xs font-medium uppercase tracking-wider text-right cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('updates')}
                            >
                                <div class="flex items-center justify-end gap-1">
                                    {t('index.table.autoUpdates')}
                                    <SortIcon column="updates" currentSort={sort} />
                                </div>
                            </th>
                            <th
                                class="px-6 py-3 text-xs font-medium uppercase tracking-wider text-right cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('mapped')}
                            >
                                <div class="flex items-center justify-end gap-1">
                                    {t('index.table.mappedTotal')}
                                    <SortIcon column="mapped" currentSort={sort} />
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-800">
                        {pageData.map(spider => (
                            <SpiderRow key={spider.name} spider={spider} />
                        ))}
                    </tbody>
                </table>
            </div>

            <div class="flex justify-between items-center bg-gray-800 p-4 rounded-lg">
                <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={effectivePage === 1}
                    class="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600 disabled:opacity-50 transition-colors cursor-pointer text-sm font-medium"
                >
                    {t('index.pagination.previous')}
                </button>
                <span class="text-gray-400 font-medium text-sm">
                    {t('index.pagination.pageOf', { page: effectivePage, totalPages })}
                </span>
                <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={effectivePage === totalPages || filtered.length === 0}
                    class="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600 disabled:opacity-50 transition-colors cursor-pointer text-sm font-medium"
                >
                    {t('index.pagination.next')}
                </button>
            </div>
        </div>
    );
}

function SortIcon({ column, currentSort }) {
    if (currentSort.column !== column) {
        return (
            <svg class="w-3 h-3 opacity-20" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 12l5 5 5-5H5zM5 8l5-5 5 5H5z" />
            </svg>
        );
    }
    return (
        <svg class={`w-3 h-3 ${currentSort.direction === 'asc' ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M5 15l5 5 5-5H5z" />
        </svg>
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
        green: t('index.stability.stable'),
        orange: t('index.stability.minorVariations'),
        red: t('index.stability.majorVariations'),
        gray: t('index.stability.missingData'),
    };

    const showTotals = !loadStatus && isBrandSpider;

    return (
        <tr
            class="flex flex-col md:table-row border-b border-gray-800 md:border-gray-700 hover:bg-gray-800 cursor-pointer p-4 md:p-0"
            onClick={() => (window.location.href = `${name}/`)}
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
                            onClick={e => e.stopPropagation()}
                        >
                            {name}
                        </a>
                        {loadStatus && (
                            <span class="ml-2 px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-400">{loadStatus}</span>
                        )}
                    </div>
                </div>
            </td>
            <td class="hidden md:table-cell md:px-6 md:py-4">
                <a
                    href={`${name}/`}
                    class="text-blue-400 hover:underline font-bold text-lg"
                    onClick={e => e.stopPropagation()}
                >
                    {name}
                </a>
                {loadStatus && (
                    <span class="ml-2 px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-400">{loadStatus}</span>
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
                            <span class="text-blue-400 font-semibold">{showTotals ? automaticUpdatesCount : ''}</span>
                        </div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-tighter leading-none whitespace-nowrap mt-1">
                            (Auto Updates)
                        </div>
                    </div>
                    <div class="flex flex-col md:hidden text-right">
                        <div class="text-sm">
                            <span class="text-gray-200 font-semibold">{showTotals ? mappedCount : ''}</span>
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
                    <span class="text-blue-400 font-semibold">{showTotals ? automaticUpdatesCount : ''}</span>
                </div>
            </td>
            <td class="hidden md:table-cell md:px-6 md:py-4 md:text-right">
                <div>
                    <span class="text-gray-200 font-semibold">{showTotals ? mappedCount : ''}</span>
                    <span class="text-gray-500">{showTotals ? ` / ${totalCount}` : ''}</span>
                </div>
            </td>
        </tr>
    );
}

window.initDashboard = async allSpiderResults => {
    await initI18n();
    const container = document.getElementById('dashboard-root');
    if (container) {
        render(<Dashboard allSpiderResults={allSpiderResults} />, container);
    }
    const switcherContainer = document.getElementById('language-switcher-root');
    if (switcherContainer) {
        render(<LanguageSwitcher />, switcherContainer);
    }
};
