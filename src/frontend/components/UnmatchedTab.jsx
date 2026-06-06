import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { TagsWithLinks, OsmColumn, Pagination, BulkJosmLinks, LoadingIndicator } from './Common';
import { BrandFilters } from './UnmappedTab';

export function UnmatchedTab({ unmatchedCache, loading, filters, currentState, setCurrentState, visitedSet, atpDate, onVisited, onJosmError, pageSize }) {
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
        return filtered;
    }, [unmatchedCache, currentState.brand, currentState.wikidata]);

    const totalPages = Math.ceil(filteredUnmatched.length / pageSize) || 1;
    const effectivePage = Math.min(currentState.page, totalPages);
    const pageData = filteredUnmatched.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

    return (
        <div>
            {filters && filters.length > 1 && (
                <BrandFilters
                    filters={filters}
                    currentState={currentState}
                    onFilterChange={(b, w) => setCurrentState(prev => ({ ...prev, brand: b, wikidata: w, page: 1 }))}
                    totalCount={unmatchedCache ? unmatchedCache.length : 0}
                />
            )}

            {loading && <LoadingIndicator message="Loading Unmatched items..." />}

            {!loading && (
                <>
                    <div class="overflow-x-auto md:overflow-x-visible bg-gray-900 rounded-lg shadow mb-6">
                        <table class="min-w-full table-auto">
                            <thead class={`bg-gray-800 text-gray-400 text-left sticky z-10 shadow-sm ${filters && filters.length > 1 ? 'top-[114px] md:top-[122px]' : 'top-[44px] md:top-[52px]'}`}>
                                <tr class="hidden md:table-row">
                                    <th class="px-4 py-3">OSM ID</th>
                                    <th class="px-4 py-3">Tags</th>
                                    <th class="px-4 py-3 text-right">OSM</th>
                                </tr>
                            </thead>
                            <tbody class="text-gray-300 divide-y divide-gray-800">
                                {pageData.map(r => (
                                    <tr key={r.id} class="flex flex-col md:table-row border-b border-gray-800 md:border-none p-4 md:p-0 hover:bg-gray-800 transition-colors">
                                        <td class="md:table-cell md:px-4 md:py-3 font-medium break-all mb-2 md:mb-0">
                                            <div class="text-lg md:text-base flex items-center flex-wrap">
                                                {r.id}
                                            </div>
                                        </td>
                                        <td class="md:table-cell md:px-4 md:py-3">
                                            <div class="flex md:block">
                                                <span class="md:hidden font-bold text-gray-400 w-16 shrink-0 text-sm">Tags:</span>
                                                <div class="text-xs font-mono whitespace-pre-wrap flex-grow">
                                                    <TagsWithLinks tags={r.tags} visitedSet={visitedSet} />
                                                </div>
                                            </div>
                                        </td>
                                        <td class="md:table-cell md:px-4 md:py-3 md:text-right">
                                            <OsmColumn osmId={r.id} visitedSet={visitedSet} atpDate={atpDate} onVisited={onVisited} onJosmError={onJosmError} />
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
                            <BulkJosmLinks items={filteredUnmatched} atpDate={atpDate} onVisited={onVisited} onJosmError={onJosmError} />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
