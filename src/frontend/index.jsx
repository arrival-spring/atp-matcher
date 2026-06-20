import { render, h, Fragment } from 'preact';
import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { escapeHtml } from './utils';
import { t, initI18n, getLocale } from './i18n';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { TierProvider, useTier } from './components/TierContext';

const PAGE_SIZE = 10;

/**
 * A dropdown component to filter spiders by country.
 * Supports searching and keyboard navigation.
 *
 * @param {Object} props - The component props.
 * @param {Object[]} props.allSpiderResults - All spider results to extract countries from.
 * @param {string|null} props.selectedCountry - The currently selected country code.
 * @param {Function} props.onSelect - Callback when a country is selected.
 */
function CountryFilter({ allSpiderResults, selectedCountry, onSelect }) {
    const { tier } = useTier();
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef(null);
    const inputRef = useRef(null);

    const countries = useMemo(() => {
        const codes = new Set();
        allSpiderResults.forEach(s => {
            if (s.countries) s.countries.forEach(c => codes.add(c));
        });

        const locale = getLocale();
        const displayNames = new Intl.DisplayNames([locale], { type: 'region' });

        return Array.from(codes)
            .map(code => {
                let name = code;
                try {
                    name = displayNames.of(code);
                } catch (_e) {
                    // Ignore
                }
                return { code, name };
            })
            .sort((a, b) => a.name.localeCompare(b.name, locale));
    }, [allSpiderResults]);

    const filteredCountries = useMemo(() => {
        const searchLower = search.toLowerCase();
        return countries.filter(
            c => c.name.toLowerCase().includes(searchLower) || c.code.toLowerCase().includes(searchLower)
        );
    }, [countries, search]);

    const items = [{ code: null, name: t('dashboard.showAllCountries') }, ...filteredCountries];

    useEffect(() => {
        function handleClickOutside(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            setSelectedIndex(0);
            setSearch('');
        }
    }, [isOpen]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [search]);

    function handleKeyDown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            onSelect(items[selectedIndex].code);
            setIsOpen(false);
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    }

    const selectedName = selectedCountry
        ? countries.find(c => c.code === selectedCountry)?.name || selectedCountry
        : t('dashboard.showAllCountries');

    return (
        <div class="relative md:w-48 shrink-0" ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                class={`w-full flex items-center justify-between px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-1 ${tier === 'auto' ? 'focus:ring-blue-500' : 'focus:ring-amber-500'} transition-colors`}
            >
                <span class="truncate">
                    {selectedName === t('dashboard.showAllCountries') ? t('dashboard.showAllCountries') : selectedName}
                </span>
                <svg
                    class={`w-4 h-4 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div class="absolute z-50 w-full mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
                    <div class="p-2 border-b border-gray-800">
                        <input
                            ref={inputRef}
                            type="text"
                            autocomplete="off"
                            class={`w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 ${tier === 'auto' ? 'focus:ring-blue-500' : 'focus:ring-amber-500'}`}
                            placeholder={t('dashboard.countryFilterPlaceholder')}
                            value={search}
                            onInput={e => setSearch(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                    </div>
                    <div class="max-h-64 overflow-y-auto no-scrollbar">
                        {items.map((item, index) => (
                            <button
                                key={item.code}
                                class={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                    index === selectedIndex
                                        ? 'bg-gray-800 text-white'
                                        : 'text-gray-400 hover:bg-gray-800'
                                }`}
                                onClick={() => {
                                    onSelect(item.code);
                                    setIsOpen(false);
                                }}
                                onMouseEnter={() => setSelectedIndex(index)}
                            >
                                {item.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * A global search bar component for the index page.
 * Allows searching for spiders and brands across the entire project.
 *
 * @param {Object} props - The component props.
 * @param {string} props.basePath - The base path for links and asset fetching.
 */
function GlobalSearch({ basePath }) {
    const [search, setSearch] = useState('');
    const [results, setResults] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [globalIndex, setGlobalIndex] = useState([]);
    const containerRef = useRef(null);

    useEffect(() => {
        fetch(`${basePath}/global_index.json`)
            .then(res => res.json())
            .then(data => setGlobalIndex(data))
            .catch(err => console.error('Failed to load global index:', err));
    }, [basePath]);

    useEffect(() => {
        if (!search.trim()) {
            setResults([]);
            setIsOpen(false);
            return;
        }

        const searchLower = search.toLowerCase();
        const filtered = globalIndex
            .filter(
                s =>
                    s.name.toLowerCase().includes(searchLower) ||
                    (s.brands && s.brands.some(b => b.toLowerCase().includes(searchLower)))
            )
            .slice(0, 10);

        setResults(filtered);
        setIsOpen(true);
        setSelectedIndex(0);
    }, [search, globalIndex]);

    useEffect(() => {
        function handleClickOutside(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    function handleKeyDown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            if (results[selectedIndex]) {
                const res = results[selectedIndex];
                window.location.href = `${basePath}/${res.tier}/${res.name}/`;
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    }

    return (
        <div class="relative max-w-2xl" ref={containerRef}>
            <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg class="h-6 w-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    autocomplete="off"
                    class="block w-full pl-12 pr-12 py-4 bg-gray-900 border border-gray-700 rounded-xl text-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-lg"
                    placeholder={t('dashboard.searchPlaceholder')}
                    value={search}
                    onInput={e => setSearch(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => search.trim() && setIsOpen(true)}
                />
                {search && (
                    <button
                        onClick={() => setSearch('')}
                        class="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-white"
                    >
                        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div class="absolute z-50 w-full mt-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
                    {results.map((res, index) => (
                        <a
                            key={`${res.tier}-${res.name}`}
                            href={`${basePath}/${res.tier}/${res.name}/`}
                            class={`block px-6 py-4 transition-colors relative border-l-4 ${
                                res.tier === 'auto' ? 'border-emerald-500' : 'border-amber-500'
                            } ${index === selectedIndex ? 'bg-gray-800' : 'hover:bg-gray-800'}`}
                            onMouseEnter={() => setSelectedIndex(index)}
                        >
                            <div class="text-white font-bold text-lg">{res.name}</div>
                            {res.brands && res.brands.length > 0 && (
                                <div class="text-gray-400 text-sm mt-1 truncate">{res.brands.join(', ')}</div>
                            )}
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * The main dashboard component for the tier index pages.
 * Displays a sortable and filterable table of all spiders in that tier.
 * Manages its own state for search, pagination, and sorting, persisting it in the URL hash.
 *
 * @param {Object} props - The component props.
 * @param {Object[]} props.allSpiderResults - The results for all spiders in the tier.
 */
function Dashboard({ allSpiderResults }) {
    const { linkClass } = useTier();
    const scrollRef = useRef(null);
    const [fadeState, setFadeState] = useState('');

    function updateFadeEffect() {
        const container = scrollRef.current;
        if (!container) return;

        const { scrollLeft, scrollWidth, clientWidth } = container;
        const isScrollable = scrollWidth > clientWidth;
        const atStart = scrollLeft <= 1;
        const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;

        if (!isScrollable) setFadeState('');
        else if (!atStart && !atEnd) setFadeState('fade-both');
        else if (!atStart) setFadeState('fade-left');
        else if (!atEnd) setFadeState('fade-right');
        else setFadeState('');
    }

    useEffect(() => {
        updateFadeEffect();
        window.addEventListener('resize', updateFadeEffect);
        return () => window.removeEventListener('resize', updateFadeEffect);
    }, []);

    const [currentLocale, setCurrentLocale] = useState(null);

    useEffect(() => {
        const handleLocaleChange = e => setCurrentLocale(e.detail);
        window.addEventListener('localeChanged', handleLocaleChange);
        return () => window.removeEventListener('localeChanged', handleLocaleChange);
    }, []);

    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ column: null, direction: 'desc' });
    const [selectedCountry, setSelectedCountry] = useState(null);
    const isFirstRender = useRef(true);

    // Load state from URL hash
    useEffect(() => {
        function loadState() {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const s = params.get('search') || '';
            const p = parseInt(params.get('page')) || 1;
            const sortCol = params.get('sort');
            const sortDir = params.get('dir') || 'desc';
            const country = params.get('country');
            setSearch(s);
            setPage(p);
            if (sortCol) setSort({ column: sortCol, direction: sortDir });
            setSelectedCountry(country);
        }

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
        if (selectedCountry) params.set('country', selectedCountry);

        const newHash = params.toString();
        if (window.location.hash.substring(1) !== newHash) {
            const method = isFirstRender.current ? 'replaceState' : 'pushState';
            window.history[method]({}, '', `${url.pathname}${url.search}${newHash ? '#' + newHash : ''}`);
        }
        isFirstRender.current = false;
    }, [search, page, sort, selectedCountry]);

    function handleSort(column) {
        let direction = column === 'name' ? 'asc' : 'desc';
        if (sort.column === column) {
            direction = sort.direction === 'desc' ? 'asc' : 'desc';
        }
        setSort({ column, direction });
        setPage(1);
    }

    const filtered = useMemo(() => {
        let data = allSpiderResults.filter(spider => {
            const searchLower = search.toLowerCase();
            const matchesSearch =
                spider.name.toLowerCase().includes(searchLower) ||
                (spider.brands && spider.brands.some(b => b.toLowerCase().includes(searchLower)));
            const matchesCountry = !selectedCountry || (spider.countries && spider.countries.includes(selectedCountry));
            return matchesSearch && matchesCountry;
        });

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
    }, [allSpiderResults, search, sort, selectedCountry]);

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
    const effectivePage = Math.min(page, totalPages);

    const pageData = useMemo(() => {
        const start = (effectivePage - 1) * PAGE_SIZE;
        return filtered.slice(start, start + PAGE_SIZE);
    }, [filtered, effectivePage]);

    function handleSearchChange(e) {
        setSearch(e.target.value);
        setPage(1);
    }

    function handleSearchKeyDown(e) {
        if (e.key === 'Enter') {
            if (filtered.length === 1) {
                window.location.href = `${filtered[0].name}/`;
            }
        }
    }

    const sortColumns = [
        { key: 'status', label: t('dashboard.table.status') },
        { key: 'name', label: t('dashboard.table.spiderName') },
        { key: 'issues', label: t('dashboard.table.issuesMapped') },
        { key: 'mapped', label: t('dashboard.table.mappedTotal') },
    ];

    return (
        <div class="space-y-6">
            <div class="flex flex-col md:flex-row gap-4">
                <div class="relative flex-grow">
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
                        autocomplete="off"
                        class={`block w-full pl-10 pr-10 py-3 border border-gray-700 rounded-lg leading-5 bg-gray-900 text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-1 ${useTier().tier === 'auto' ? 'focus:ring-blue-500 focus:border-blue-500' : 'focus:ring-amber-500 focus:border-amber-500'} sm:text-sm transition-colors`}
                        placeholder={t('dashboard.searchPlaceholder')}
                        value={search}
                        onInput={handleSearchChange}
                        onKeyDown={handleSearchKeyDown}
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white"
                        >
                            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    )}
                </div>
                <CountryFilter
                    allSpiderResults={allSpiderResults}
                    selectedCountry={selectedCountry}
                    onSelect={c => {
                        setSelectedCountry(c);
                        setPage(1);
                    }}
                />
            </div>
            <div class="md:hidden">
                <div class={`relative overflow-hidden fade-wrapper ${fadeState}`}>
                    <div
                        ref={scrollRef}
                        onScroll={updateFadeEffect}
                        class="flex overflow-x-auto no-scrollbar gap-2 pb-2"
                    >
                        {sortColumns.map(col => {
                            const active = sort.column === col.key;
                            return (
                                <button
                                    key={col.key}
                                    class={`px-4 py-2 rounded-full text-sm font-medium border transition-colors whitespace-nowrap flex items-center gap-1 ${
                                        active
                                            ? `${useTier().tier === 'auto' ? 'bg-blue-600 border-blue-500' : 'bg-amber-600 border-amber-500'} text-white shadow-md`
                                            : 'border-gray-600 text-gray-300 hover:bg-gray-700 cursor-pointer'
                                    }`}
                                    onClick={() => handleSort(col.key)}
                                >
                                    {col.label}
                                    <SortIcon column={col.key} currentSort={sort} />
                                </button>
                            );
                        })}
                    </div>
                </div>
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
                                    {t('dashboard.table.status')}
                                    <SortIcon column="status" currentSort={sort} />
                                </div>
                            </th>
                            <th
                                class="px-6 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('name')}
                            >
                                <div class="flex items-center gap-1">
                                    {t('dashboard.table.spiderName')}
                                    <SortIcon column="name" currentSort={sort} />
                                </div>
                            </th>
                            <th
                                class="px-6 py-3 text-xs font-medium uppercase tracking-wider text-right cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('issues')}
                            >
                                <div class="flex items-center justify-end gap-1">
                                    {t('dashboard.table.issuesMapped')}
                                    <SortIcon column="issues" currentSort={sort} />
                                </div>
                            </th>
                            <th
                                class="px-6 py-3 text-xs font-medium uppercase tracking-wider text-right cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('mapped')}
                            >
                                <div class="flex items-center justify-end gap-1">
                                    {t('dashboard.table.mappedTotal')}
                                    <SortIcon column="mapped" currentSort={sort} />
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-800">
                        {pageData.map(spider => (
                            <SpiderRow key={spider.name} spider={spider} onSort={handleSort} currentSort={sort} />
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
                    {t('dashboard.pagination.previous')}
                </button>
                <span class="text-gray-400 font-medium text-sm">
                    {t('dashboard.pagination.pageOf', { page: effectivePage, totalPages })}
                </span>
                <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={effectivePage === totalPages || filtered.length === 0}
                    class="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600 disabled:opacity-50 transition-colors cursor-pointer text-sm font-medium"
                >
                    {t('dashboard.pagination.next')}
                </button>
            </div>
        </div>
    );
}

/**
 * An icon component indicating the current sort direction for a table column.
 *
 * @param {Object} props - The component props.
 * @param {string} props.column - The column key.
 * @param {Object} props.currentSort - The current sort state (column and direction).
 */
function SortIcon({ column, currentSort }) {
    if (currentSort.column !== column) {
        return (
            <svg class="w-3 h-3 opacity-20" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 12l5 5 5-5H5zM5 8l5-5 5 5H5z" />
            </svg>
        );
    }
    return (
        <svg
            class={`w-3 h-3 ${currentSort.direction === 'asc' ? 'rotate-180' : ''}`}
            fill="currentColor"
            viewBox="0 0 20 20"
        >
            <path d="M5 15l5 5 5-5H5z" />
        </svg>
    );
}

/**
 * A table row component representing a single spider in the dashboard.
 *
 * @param {Object} props - The component props.
 * @param {Object} props.spider - The spider data.
 * @param {Function} props.onSort - Callback to change the table sorting.
 * @param {Object} props.currentSort - The current sort state.
 */
function SpiderRow({ spider, onSort, currentSort }) {
    const { linkClass, tier } = useTier();
    const isAuto = tier === 'auto';
    const { name, issuesCount, mappedCount, totalCount, isBrandSpider, stabilityColor, loadStatus, brands } = spider;

    const statusColors = {
        green: 'bg-green-500',
        orange: 'bg-orange-500',
        red: 'bg-red-500',
        gray: 'bg-gray-600',
    };

    const statusTitles = {
        green: t('dashboard.stability.stable'),
        orange: t('dashboard.stability.minorVariations'),
        red: t('dashboard.stability.majorVariations'),
        gray: t('dashboard.stability.missingData'),
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
                        class={`w-3 h-3 rounded-full shrink-0 ${statusColors[stabilityColor] || 'bg-gray-600'}`}
                        title={statusTitles[stabilityColor]}
                    />
                    <div class="md:hidden flex-grow flex items-center justify-between">
                        <div class="flex items-center">
                            <a
                                href={`${name}/`}
                                class={`${linkClass(false)} hover:underline font-bold text-base`}
                                onClick={e => e.stopPropagation()}
                            >
                                {name}
                            </a>
                            {brands && brands.length > 0 && (
                                <span class="ml-2 text-xs text-gray-500 font-normal">{brands.join(', ')}</span>
                            )}
                            {loadStatus && (
                                <span class="ml-2 px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-400">
                                    {loadStatus}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </td>
            <td class="hidden md:table-cell md:px-6 md:py-4">
                <div class="flex flex-col">
                    <div class="flex items-baseline gap-2">
                        <a
                            href={`${name}/`}
                            class={`${linkClass(false)} hover:underline font-bold text-lg`}
                            onClick={e => e.stopPropagation()}
                        >
                            {name}
                        </a>
                        {loadStatus && (
                            <span class="px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-400">{loadStatus}</span>
                        )}
                    </div>
                    {brands && brands.length > 0 && (
                        <div class="text-sm text-gray-500 font-normal mt-0.5">{brands.join(', ')}</div>
                    )}
                </div>
            </td>
            <td class="md:table-cell md:px-6 md:py-4 md:text-right">
                <div class="grid grid-cols-2 md:block">
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
                    <div class="flex flex-col md:hidden text-right">
                        <div class="text-sm">
                            <span class="text-gray-200 font-semibold">{showTotals ? mappedCount : ''}</span>
                            <span class="text-gray-500">{showTotals ? ` / ${totalCount}` : ''}</span>
                        </div>
                        <div class="md:hidden text-[10px] text-gray-500 uppercase tracking-tighter leading-none whitespace-nowrap mt-1">
                            (Mapped / Total)
                        </div>
                    </div>
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

/**
 * Initializes the dashboard application.
 *
 * @param {Object[]} allSpiderResults - Results for all spiders.
 * @param {string} [tier='auto'] - The spider's tier ('auto' or 'preview').
 */
window.initDashboard = async function (allSpiderResults, tier = 'auto') {
    await initI18n();
    const container = document.getElementById('dashboard-root');
    if (container) {
        render(
            <TierProvider tier={tier}>
                <Dashboard allSpiderResults={allSpiderResults} />
            </TierProvider>,
            container
        );
    }
    const switcherContainer = document.getElementById('language-switcher-root');
    if (switcherContainer) {
        render(<LanguageSwitcher />, switcherContainer);
    }
};

/**
 * Initializes the index page application.
 */
window.initIndexPage = async function () {
    await initI18n();
    const searchContainer = document.getElementById('global-search-root');
    if (searchContainer) {
        render(<GlobalSearch basePath="." />, searchContainer);
    }
    const switcherContainer = document.getElementById('language-switcher-root');
    if (switcherContainer) {
        render(
            <TierProvider tier="auto">
                <LanguageSwitcher />
            </TierProvider>,
            switcherContainer
        );
    }
};
