import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { StatusLabel, TagsWithLinks, Pagination, LoadingIndicator } from './Common';
import { MismatchModal } from './Modals';
import { handleJosmLink } from '../utils';

export function UnmappedTab({ results, unmappedCache, loading, filters, currentState, setCurrentState, visitedSet, spiderName, onJosmError, pageSize }) {
    const disallowedOrNotBrand = useMemo(() => results.filter(r =>
        ['disallowed source uri', 'not a brand spider'].includes(r.status)
    ), [results]);

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
        return filtered;
    }, [disallowedOrNotBrand, unmappedCache, currentState.brand, currentState.wikidata]);

    const totalPages = Math.ceil(allUnmapped.length / pageSize) || 1;
    const effectivePage = Math.min(currentState.page, totalPages);
    const pageData = allUnmapped.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

    const [showJosmWarning, setShowJosmWarning] = useState(false);

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
            {filters && filters.length > 1 && (
                <BrandFilters
                    filters={filters}
                    currentState={currentState}
                    onFilterChange={(b, w) => setCurrentState(prev => ({ ...prev, brand: b, wikidata: w, page: 1 }))}
                    totalCount={disallowedOrNotBrand.length + (unmappedCache ? unmappedCache.length : 0)}
                />
            )}

            {loading && <LoadingIndicator message="Loading Unmapped items..." />}

            {!loading && (
                <>
                    <div class="overflow-x-auto md:overflow-x-visible bg-gray-900 rounded-lg shadow mb-6">
                        <table class="min-w-full table-auto">
                            <thead class={`bg-gray-800 text-gray-400 text-left sticky z-10 shadow-sm ${filters && filters.length > 1 ? 'top-[114px] md:top-[122px]' : 'top-[44px] md:top-[52px]'}`}>
                                <tr class="hidden md:table-row">
                                    <th class="px-4 py-3">Ref</th>
                                    <th class="px-4 py-3">Tags</th>
                                </tr>
                            </thead>
                            <tbody class="text-gray-300 divide-y divide-gray-800">
                                {pageData.map(r => (
                                    <tr key={r.ref} class="flex flex-col md:table-row border-b border-gray-800 md:border-none p-4 md:p-0 hover:bg-gray-800 transition-colors">
                                        <td class="md:table-cell md:px-4 md:py-3 font-medium break-all mb-2 md:mb-0">
                                            <div class="text-lg md:text-base flex items-center flex-wrap">
                                                {r.ref}
                                                <StatusLabel status={r.status} />
                                            </div>
                                        </td>
                                        <td class="md:table-cell md:px-4 md:py-3">
                                            <div class="flex md:block">
                                                <span class="md:hidden font-bold text-gray-400 w-16 shrink-0 text-sm">Tags:</span>
                                                <div class="text-xs font-mono whitespace-pre-wrap flex-grow">
                                                    <TagsWithLinks tags={r.allAtpTags} visitedSet={visitedSet} />
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
                            class="text-blue-400 hover:underline text-sm cursor-pointer bg-transparent border-none"
                        >
                            Open unmapped items in JOSM
                        </button>
                    </div>

                    {showJosmWarning && (
                        <>
                            <MismatchModal
                                title="JOSM Import Warning"
                                message="This will load and open the unmapped items from ATP into JOSM. This may be useful to match them to existing elements. <strong class='text-white'>DO NOT import them</strong>, but use conflation and judgement."
                                onUnderstand={handleImport}
                                onBack={() => setShowJosmWarning(false)}
                                showImportBtn
                            />
                            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => setShowJosmWarning(false)} />
                        </>
                    )}
                </>
            )}
        </div>
    );
}

export function BrandFilters({ filters, currentState, onFilterChange, totalCount }) {
    return (
        <div class="sticky top-[44px] md:top-[52px] z-20 bg-gray-950 py-4 -mx-4 px-4 md:mx-0 md:px-0">
            <div class="relative overflow-hidden fade-wrapper">
                <div class="flex overflow-x-auto no-scrollbar gap-2">
                    <button
                        class={`px-4 py-2 rounded-full text-sm font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                            currentState.brand === null && currentState.wikidata === null
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                        }`}
                        onClick={() => onFilterChange(null, null)}
                    >
                        All brands
                        <span class="ml-2 px-2 py-0.5 rounded-full bg-gray-900 text-xs">{totalCount}</span>
                    </button>
                    {filters.map(filter => {
                        const active = currentState.brand === (filter.brand || null) && currentState.wikidata === (filter.wikidata || null);
                        return (
                            <button
                                key={filter.label}
                                class={`px-4 py-2 rounded-full text-sm font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                                    active
                                        ? 'bg-blue-600 border-blue-500 text-white'
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
