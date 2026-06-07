import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { StatusLabel, TagValue, SpiderValue, OsmColumn, Pagination } from './Common';

export function TagTab({
    tag,
    results,
    currentState,
    setCurrentState,
    visitedSet,
    atpDate,
    onLinkClick,
    onJosmError,
    pageSize,
}) {
    const tagResults = useMemo(
        () =>
            results
                .map(r => {
                    const tagData = r.tags.find(t => t.tag === tag);
                    return tagData
                        ? {
                              ...r,
                              tagStatus: tagData.status,
                              osmValue: tagData.osmValue,
                              spiderValue: tagData.spiderValue,
                              history: tagData.history,
                          }
                        : null;
                })
                .filter(r => r !== null),
        [results, tag]
    );

    const filtered = useMemo(() => {
        if (!currentState.status) return tagResults;
        return tagResults.filter(r => r.tagStatus === currentState.status);
    }, [tagResults, currentState.status]);

    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    const effectivePage = Math.min(currentState.page, totalPages);
    const pageData = filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

    const possibleStatuses = ['disallowed source uri', 'mismatch', 'update OSM', 'Add to OSM', 'matching'];
    const showOsmColumns = currentState.status !== 'Add to OSM';

    return (
        <div>
            <div class="sticky top-[44px] md:top-[52px] z-20 bg-gray-950 py-4 -mx-4 px-4 md:mx-0 md:px-0">
                <div class="relative overflow-hidden fade-wrapper">
                    <div class="flex overflow-x-auto no-scrollbar gap-2">
                        {possibleStatuses.map(status => {
                            const count = tagResults.filter(r => r.tagStatus === status).length;
                            if (count === 0 && status === 'disallowed source uri') return null;
                            const active = currentState.status === status;
                            return (
                                <button
                                    key={status}
                                    class={`px-4 py-2 rounded-full text-sm font-medium border transition-colors whitespace-nowrap ${
                                        count > 0
                                            ? active
                                                ? 'bg-blue-600 border-blue-500 text-white cursor-pointer'
                                                : 'border-gray-600 text-gray-300 hover:bg-gray-700 cursor-pointer'
                                            : 'border-gray-800 text-gray-600 cursor-not-allowed'
                                    }`}
                                    onClick={() =>
                                        count > 0 &&
                                        setCurrentState(prev => ({ ...prev, status: active ? null : status, page: 1 }))
                                    }
                                    disabled={count === 0}
                                >
                                    <span class="capitalize">{status}</span>
                                    <span class="ml-2 px-2 py-0.5 rounded-full bg-gray-900 text-xs">{count}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div class="overflow-x-auto md:overflow-x-visible bg-gray-900 rounded-lg shadow mb-6">
                <table class="min-w-full table-auto">
                    <thead class="bg-gray-800 text-gray-400 text-left sticky top-[114px] md:top-[122px] z-10 shadow-sm">
                        <tr class="hidden md:table-row">
                            <th class="px-4 py-3">Ref</th>
                            <th class="px-4 py-3">Spider Value</th>
                            {showOsmColumns && <th class="px-4 py-3">OSM Value</th>}
                            <th class="px-4 py-3 text-right">OSM</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 divide-y divide-gray-800">
                        {pageData.map(r => {
                            const suggestedFixes = {};
                            if (
                                r.tagStatus === 'Add to OSM' ||
                                r.tagStatus === 'update OSM' ||
                                (r.tagStatus === 'mismatch' && currentState.status === 'mismatch')
                            ) {
                                suggestedFixes[tag] = r.spiderValue;
                            }
                            return (
                                <tr
                                    key={r.ref}
                                    class="flex flex-col md:table-row border-b border-gray-800 md:border-none p-4 md:p-0 hover:bg-gray-800 transition-colors"
                                >
                                    <td class="md:table-cell md:px-4 md:py-3 font-medium break-all mb-2 md:mb-0">
                                        <div class="text-lg md:text-base flex items-center flex-wrap">
                                            {r.ref}
                                            <StatusLabel status={r.tagStatus} />
                                        </div>
                                    </td>
                                    <td class="md:table-cell md:px-4 md:py-3 mb-2 md:mb-0">
                                        <div class="flex md:block">
                                            <span class="md:hidden font-bold text-gray-400 w-16 shrink-0 text-sm">
                                                Spider:
                                            </span>
                                            <div class="flex-grow">
                                                <SpiderValue
                                                    value={r.spiderValue}
                                                    history={r.history}
                                                    tag={tag}
                                                    visitedSet={visitedSet}
                                                />
                                            </div>
                                        </div>
                                    </td>
                                    {showOsmColumns && (
                                        <td class="md:table-cell md:px-4 md:py-3 mb-2 md:mb-0">
                                            <div class="flex md:block">
                                                <span class="md:hidden font-bold text-gray-400 w-16 shrink-0 text-sm">
                                                    OSM:
                                                </span>
                                                <div class="flex-grow">
                                                    <TagValue value={r.osmValue} tag={tag} visitedSet={visitedSet} />
                                                </div>
                                            </div>
                                        </td>
                                    )}
                                    <td class="md:table-cell md:px-4 md:py-3 md:text-right">
                                        <OsmColumn
                                            osmId={r.osmId}
                                            suggestedFixes={suggestedFixes}
                                            visitedSet={visitedSet}
                                            atpDate={atpDate}
                                            onVisited={() => onLinkClick()}
                                            onJosmError={onJosmError}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Pagination
                page={effectivePage}
                totalPages={totalPages}
                onPageChange={p => setCurrentState(prev => ({ ...prev, page: p }))}
                totalItems={filtered.length}
            />
        </div>
    );
}
