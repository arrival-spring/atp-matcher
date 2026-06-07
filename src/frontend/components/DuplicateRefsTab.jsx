import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { StatusLabel, TagsWithLinks, Pagination } from './Common';

export function DuplicateRefsTab({ results, currentState, setCurrentState, visitedSet, pageSize }) {
    const duplicates = useMemo(() => results.filter(r => r.matchCount > 1), [results]);
    const totalPages = Math.ceil(duplicates.length / pageSize) || 1;
    const effectivePage = Math.min(currentState.page, totalPages);
    const pageData = duplicates.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

    return (
        <div>
            <div class="overflow-x-auto md:overflow-x-visible bg-gray-900 rounded-lg shadow mb-6">
                <table class="min-w-full table-auto">
                    <thead class="bg-gray-800 text-gray-400 text-left sticky top-[44px] md:top-[52px] z-10 shadow-sm">
                        <tr class="hidden md:table-row">
                            <th class="px-4 py-3">Ref</th>
                            <th class="px-4 py-3">Tags</th>
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
                                        <StatusLabel status={`${r.status} (${r.matchCount} matches)`} />
                                    </div>
                                </td>
                                <td class="md:table-cell md:px-4 md:py-3">
                                    <div class="flex md:block">
                                        <span class="md:hidden font-bold text-gray-400 w-16 shrink-0 text-sm">
                                            Tags:
                                        </span>
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
                totalItems={duplicates.length}
            />
        </div>
    );
}
