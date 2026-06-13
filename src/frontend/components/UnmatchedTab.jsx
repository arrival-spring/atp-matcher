import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { TagsWithLinks, OsmColumn, Pagination, BulkJosmLinks, LoadingIndicator } from './Common';
import { t } from '../i18n';
import { BrandFilters } from './UnmappedTab';
import { useTheme } from './ThemeContext';

/**
 * The unmatched tab component for the spider detail page.
 * Displays OSM features that match the brand criteria but were not linked to any ATP feature.
 * Supports brand filtering, search, and bulk opening in JOSM.
 *
 * @param {Object} props - The component props.
 * @param {Object[]|null} props.unmatchedCache - Loaded unmatched data from JSON.
 * @param {boolean} props.loading - Whether the unmatched data is still loading.
 * @param {Object[]} props.filters - Pre-calculated filters for brand/Wikidata.
 * @param {Object} props.currentState - Current state of the dashboard.
 * @param {Function} props.setCurrentState - Callback to update the state.
 * @param {Set<string>} props.visitedSet - A set of visited URLs.
 * @param {string} props.atpDate - The date of the ATP run.
 * @param {Function} props.onVisited - Callback when a link is clicked.
 * @param {Function} props.onJosmError - Callback if JOSM remote control fails.
 * @param {number} props.pageSize - The number of items to display per page.
 */
export function UnmatchedTab({
    unmatchedCache,
    loading,
    filters,
    currentState,
    setCurrentState,
    visitedSet,
    atpDate,
    onVisited,
    onJosmError,
    pageSize,
}) {
    const { theme } = useTheme();
    const filteredUnmatched = useMemo(() => {
        if (!unmatchedCache) return [];
        let filtered = unmatchedCache;

        if (currentState.brand !== null || currentState.wikidata !== null) {
            filtered = filtered.filter(r => {
                const props = r.tags;
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
                    if (r.tags) {
                        Object.values(r.tags).forEach(val => {
                            if (val && val.toLowerCase().includes(searchLower)) {
                                weight++;
                            }
                        });
                    }
                    return { ...r, weight };
                })
                .filter(r => r.weight > 0)
                .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
        }

        return filtered;
    }, [unmatchedCache, currentState.brand, currentState.wikidata, currentState.search]);

    const totalPages = Math.ceil(filteredUnmatched.length / pageSize) || 1;
    const effectivePage = Math.min(currentState.page, totalPages);
    const pageData = filteredUnmatched.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

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
                        class={`block w-full pl-10 pr-10 py-3 border border-gray-700 rounded-lg leading-5 bg-gray-900 text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-1 ${theme === 'auto' ? 'focus:ring-blue-500' : 'focus:ring-amber-500'} transition-colors sm:text-sm`}
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
                    totalCount={unmatchedCache ? unmatchedCache.length : 0}
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
                                    <th class="px-4 py-3">{t('spider.table.osmId')}</th>
                                    <th class="px-4 py-3">{t('spider.table.tags')}</th>
                                    <th class="px-4 py-3 text-right">OSM</th>
                                </tr>
                            </thead>
                            <tbody class="text-gray-300 divide-y divide-gray-800">
                                {pageData.map(r => (
                                    <tr
                                        key={r.id}
                                        class="flex flex-col md:table-row border-b border-gray-800 md:border-none p-4 md:p-0 hover:bg-gray-800 transition-colors"
                                    >
                                        <td class="md:table-cell md:px-4 md:py-3 font-medium break-all mb-2 md:mb-0">
                                            <div class="text-lg md:text-base flex items-center flex-wrap">{r.id}</div>
                                        </td>
                                        <td class="md:table-cell md:px-4 md:py-3">
                                            <div class="flex md:block">
                                                <span class="md:hidden font-bold text-gray-400 w-16 shrink-0 text-sm">
                                                    {t('spider.table.tags')}:
                                                </span>
                                                <div class="text-xs font-mono whitespace-pre-wrap flex-grow">
                                                    <TagsWithLinks
                                                        tags={r.tags}
                                                        visitedSet={visitedSet}
                                                        showOpeningHoursWarning={true}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td class="md:table-cell md:px-4 md:py-3 md:text-right">
                                            <OsmColumn
                                                osmId={r.id}
                                                visitedSet={visitedSet}
                                                atpDate={atpDate}
                                                onVisited={onVisited}
                                                onJosmError={onJosmError}
                                            />
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
                        totalItems={filteredUnmatched.length}
                    />

                    {filteredUnmatched.length > 0 && (
                        <div class="mt-8 text-center space-y-2">
                            <BulkJosmLinks
                                items={filteredUnmatched}
                                atpDate={atpDate}
                                onVisited={onVisited}
                                onJosmError={onJosmError}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
