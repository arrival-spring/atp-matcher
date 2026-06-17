import { h } from 'preact';
import { useMemo, useState, useRef, useEffect } from 'preact/hooks';
import { StatusLabel, TagsWithLinks, Pagination, LoadingIndicator } from './Common';
import { MismatchModal } from './Modals';
import { handleJosmLink } from '../utils';
import { t } from '../i18n';
import { useTier } from './TierContext';

/**
 * The unmapped tab component for the spider detail page.
 * Displays ATP features that were not matched to any OSM elements.
 * Supports brand filtering, search, and JOSM layer import.
 *
 * @param {Object} props - The component props.
 * @param {Object[]} props.results - Matching results between ATP and OSM (to extract disallowed/not brand items).
 * @param {Object[]|null} props.unmappedCache - Loaded unmapped data from JSON.
 * @param {boolean} props.loading - Whether the unmapped data is still loading.
 * @param {Object[]} props.filters - Pre-calculated filters for brand/Wikidata.
 * @param {Object} props.currentState - Current state of the dashboard.
 * @param {Function} props.setCurrentState - Callback to update the state.
 * @param {Set<string>} props.visitedSet - A set of visited URLs.
 * @param {string} props.spiderName - The name of the spider.
 * @param {Function} props.onJosmError - Callback if JOSM remote control fails.
 * @param {number} props.pageSize - The number of items to display per page.
 */
export function UnmappedTab({
    results,
    unmappedCache,
    loading,
    filters,
    currentState,
    setCurrentState,
    visitedSet,
    spiderName,
    onJosmError,
    pageSize,
}) {
    const { tier } = useTier();
    const disallowedOrNotBrand = useMemo(
        () => results.filter(r => ['disallowedSourceUri', 'notABrandSpider'].includes(r.status)),
        [results]
    );

    const allUnmapped = useMemo(() => {
        if (!unmappedCache) return disallowedOrNotBrand;
        let filtered = [...disallowedOrNotBrand, ...unmappedCache];

        if (currentState.brand !== null || currentState.wikidata !== null) {
            filtered = filtered.filter(r => {
                const props = r.allAtpTags;
                if (!props) return false;
                const b = props.brand || null;
                const w = props['brand:wikidata'] || null;
                if (currentState.brand === '__none__' && currentState.wikidata === '__none__') {
                    return b === null && w === null;
                }
                return b === currentState.brand && w === currentState.wikidata;
            });
        }

        if (currentState.search) {
            const searchLower = currentState.search.toLowerCase();
            filtered = filtered
                .map(r => {
                    let weight = 0;
                    if (r.allAtpTags) {
                        Object.values(r.allAtpTags).forEach(val => {
                            if (val && val.toLowerCase().includes(searchLower)) {
                                weight++;
                            }
                        });
                    }
                    return { ...r, weight };
                })
                .filter(r => r.weight > 0)
                .sort((a, b) => b.weight - a.weight || (a.ref || '').localeCompare(b.ref || ''));
        }

        return filtered;
    }, [disallowedOrNotBrand, unmappedCache, currentState.brand, currentState.wikidata, currentState.search]);

    const totalPages = Math.ceil(allUnmapped.length / pageSize) || 1;
    const effectivePage = Math.min(currentState.page, totalPages);
    const pageData = allUnmapped.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

    const [showJosmWarning, setShowJosmWarning] = useState(false);
    const { linkClass } = useTier();

    const handleImport = () => {
        let geojsonFile = `${spiderName}_unmapped.geojson`;
        if (currentState.brand !== null || currentState.wikidata !== null) {
            const activeFilter = filters.find(f => {
                if (currentState.brand === '__none__' && currentState.wikidata === '__none__') {
                    return f.brand === '__none__' && f.wikidata === '__none__';
                }
                return f.brand === currentState.brand && f.wikidata === currentState.wikidata;
            });
            if (activeFilter && activeFilter.geojson) {
                geojsonFile = activeFilter.geojson;
            }
        }
        const geojsonUrl = new URL(geojsonFile, window.location.href).href;
        const josmUrl = `http://127.0.0.1:8111/import?new_layer=true&upload_policy=false&url=${encodeURIComponent(geojsonUrl)}`;
        handleJosmLink(josmUrl, null, null, onJosmError);
        setShowJosmWarning(false);
    };

    return (
        <div>
            <div class="mb-6">
                <div class="relative max-w-xl">
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
                        autocomplete="off"
                        class={`block w-full pl-10 pr-10 py-3 border border-gray-700 rounded-lg leading-5 bg-gray-900 text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-1 ${tier === 'auto' ? 'focus:ring-blue-500' : 'focus:ring-amber-500'} transition-colors sm:text-sm`}
                        placeholder={t('spider.searchTags')}
                        value={currentState.search}
                        onInput={e => setCurrentState(prev => ({ ...prev, search: e.target.value, page: 1 }))}
                    />
                    {currentState.search && (
                        <button
                            onClick={() => setCurrentState(prev => ({ ...prev, search: '', page: 1 }))}
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
            </div>

            {filters && filters.length > 1 && (
                <BrandFilters
                    filters={filters}
                    currentState={currentState}
                    onFilterChange={(b, w) => setCurrentState(prev => ({ ...prev, brand: b, wikidata: w, page: 1 }))}
                    totalCount={disallowedOrNotBrand.length + (unmappedCache ? unmappedCache.length : 0)}
                />
            )}

            {loading && <LoadingIndicator message={t('spider.loading')} />}

            {!loading && (
                <>
                    <div class="overflow-x-auto md:overflow-x-visible bg-gray-900 rounded-lg shadow mb-6">
                        <table class="min-w-full table-auto">
                            <thead
                                class={`bg-gray-800 text-gray-400 text-left sticky z-10 shadow-sm ${filters && filters.length > 1 ? 'top-[124px] md:top-[122px]' : 'top-[44px] md:top-[52px]'}`}
                            >
                                <tr class="hidden md:table-row">
                                    <th class="px-4 py-3">{t('spider.table.ref')}</th>
                                    <th class="px-4 py-3">{t('spider.table.tags')}</th>
                                </tr>
                            </thead>
                            <tbody class="text-gray-300 divide-y divide-gray-800">
                                {pageData.map(r => (
                                    <tr
                                        key={r.ref}
                                        class="flex flex-col md:table-row border-b border-gray-800 md:border-none p-4 md:p-0 hover:bg-gray-800 transition-colors"
                                    >
                                        <td class="md:table-cell md:px-4 md:py-3 font-medium break-all mb-2 md:mb-0">
                                            <div class="text-lg md:text-base flex items-center flex-wrap">
                                                {r.ref}
                                                <StatusLabel status={r.status} />
                                            </div>
                                        </td>
                                        <td class="md:table-cell md:px-4 md:py-3">
                                            <div class="flex md:block">
                                                <span class="md:hidden font-bold text-gray-400 w-16 shrink-0 text-sm">
                                                    {t('spider.table.tags')}:
                                                </span>
                                                <div class="text-xs font-mono whitespace-pre-wrap flex-grow">
                                                    <TagsWithLinks
                                                        tags={r.allAtpTags}
                                                        visitedSet={visitedSet}
                                                        showOpeningHoursWarning={true}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <Pagination
                        page={effectivePage}
                        totalPages={totalPages}
                        onPageChange={p => setCurrentState(prev => ({ ...prev, page: p }))}
                        totalItems={allUnmapped.length}
                    />

                    <div class="mt-8 text-center">
                        <button
                            onClick={() => setShowJosmWarning(true)}
                            class={`${linkClass(false)} hover:underline text-sm cursor-pointer bg-transparent border-none`}
                        >
                            {t('spider.actions.openUnmapped')}
                        </button>
                    </div>

                    {showJosmWarning && (
                        <>
                            <MismatchModal
                                title={t('spider.modals.mismatch.title')}
                                message={t('spider.modals.josmImport.message')}
                                onUnderstand={handleImport}
                                onBack={() => setShowJosmWarning(false)}
                                showImportBtn
                            />
                            <div
                                class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                                onClick={() => setShowJosmWarning(false)}
                            />
                        </>
                    )}
                </>
            )}
        </div>
    );
}

/**
 * A horizontal filter bar for filtering items by brand/Wikidata.
 *
 * @param {Object} props - The component props.
 * @param {Object[]} props.filters - The available filters.
 * @param {Object} props.currentState - The current dashboard state.
 * @param {Function} props.onFilterChange - Callback when a filter is clicked.
 * @param {number} props.totalCount - The total number of items before filtering.
 */
export function BrandFilters({ filters, currentState, onFilterChange, totalCount }) {
    const { buttonClass } = useTier();
    const scrollRef = useRef(null);
    const [fadeState, setFadeState] = useState('');

    const updateFadeEffect = () => {
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
    };

    useEffect(() => {
        updateFadeEffect();
        window.addEventListener('resize', updateFadeEffect);
        return () => window.removeEventListener('resize', updateFadeEffect);
    }, []);

    return (
        <div class="sticky top-[44px] md:top-[52px] z-20 bg-gray-950 -mx-4 px-4 md:mx-0 md:px-0">
            <div class={`relative overflow-hidden fade-wrapper py-4 ${fadeState}`}>
                <div ref={scrollRef} onScroll={updateFadeEffect} class="flex overflow-x-auto no-scrollbar gap-2">
                    <button
                        class={`px-4 py-2 rounded-full text-sm font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                            currentState.brand === null && currentState.wikidata === null
                                ? `${buttonClass} border-transparent text-white shadow-md`
                                : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                        }`}
                        onClick={() => onFilterChange(null, null)}
                    >
                        {t('spider.filters.allBrands')}
                        <span class="ml-2 px-2 py-0.5 rounded-full bg-gray-900 text-xs">{totalCount}</span>
                    </button>
                    {filters.map(filter => {
                        const active =
                            currentState.brand === (filter.brand || null) &&
                            currentState.wikidata === (filter.wikidata || null);
                        return (
                            <button
                                key={filter.label}
                                class={`px-4 py-2 rounded-full text-sm font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                                    active
                                        ? `${buttonClass} border-transparent text-white shadow-md`
                                        : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                                }`}
                                onClick={() => onFilterChange(filter.brand || null, filter.wikidata || null)}
                            >
                                {filter.label}
                                <span class="ml-2 px-2 py-0.5 rounded-full bg-gray-900 text-xs">{filter.count}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
