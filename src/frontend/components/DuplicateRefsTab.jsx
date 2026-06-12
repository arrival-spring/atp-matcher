import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { StatusLabel, TagsWithLinks, Pagination, OsmColumn } from './Common';
import { t } from '../i18n';

export function DuplicateRefsTab({
    results,
    currentState,
    setCurrentState,
    visitedSet,
    atpDate,
    onLinkClick,
    onJosmError,
    pageSize,
}) {
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
                            <th class="px-4 py-3 w-1/4">{t('spider.table.ref')}</th>
                            <th class="px-4 py-3 w-1/3">{t('spider.table.atpTags')}</th>
                            <th class="px-4 py-3">{t('spider.table.osmMatches')}</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 divide-y divide-gray-800">
                        {pageData.map(r => (
                            <tr
                                key={r.ref}
                                class="flex flex-col md:table-row border-b border-gray-800 md:border-none p-4 md:p-0 hover:bg-gray-800 transition-colors"
                            >
                                <td class="md:table-cell md:px-4 md:py-3 font-medium break-all mb-2 md:mb-0 align-top">
                                    <div class="text-lg md:text-base flex items-center flex-wrap">
                                        {r.ref}
                                        <StatusLabel status={`${r.status} (${r.matchCount} matches)`} />
                                    </div>
                                </td>
                                <td class="md:table-cell md:px-4 md:py-3 mb-4 md:mb-0 align-top">
                                    <div class="flex md:block">
                                        <span class="md:hidden font-bold text-gray-400 w-24 shrink-0 text-sm">
                                            {t('spider.table.atpTags')}:
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
                                <td class="md:table-cell md:px-4 md:py-3 align-top">
                                    <div class="flex flex-col gap-4">
                                        <span class="md:hidden font-bold text-gray-400 text-sm">
                                            {t('spider.table.osmMatches')}:
                                        </span>
                                        {r.matches &&
                                            r.matches.map((match, idx) => (
                                                <div
                                                    key={match.id}
                                                    class={`flex flex-col md:flex-row md:items-start justify-between gap-4 ${
                                                        idx > 0 ? 'pt-4 border-t border-gray-700' : ''
                                                    }`}
                                                >
                                                    <div class="text-xs font-mono whitespace-pre-wrap flex-grow">
                                                        <TagsWithLinks tags={match.tags} visitedSet={visitedSet} />
                                                    </div>
                                                    <div class="shrink-0 md:text-right">
                                                        <OsmColumn
                                                            osmId={match.id}
                                                            visitedSet={visitedSet}
                                                            atpDate={atpDate}
                                                            onVisited={onLinkClick}
                                                            onJosmError={onJosmError}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
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
