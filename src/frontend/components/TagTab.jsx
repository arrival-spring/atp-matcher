import { h } from 'preact';
import { useMemo, useRef, useState, useEffect } from 'preact/hooks';
import { StatusLabel, TagValue, SpiderValue, OsmColumn, Pagination } from './Common';
import { t } from '../i18n';
import { useTheme } from './ThemeContext';

function SortIcon({ column, currentSort }) {
    if (currentSort.sort !== column) {
        return (
            <svg class="w-3 h-3 opacity-20" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 12l5 5 5-5H5zM5 8l5-5 5 5H5z" />
            </svg>
        );
    }
    return (
        <svg class={`w-3 h-3 ${currentSort.dir === 'asc' ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M5 15l5 5 5-5H5z" />
        </svg>
    );
}

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
    const scrollRef = useRef(null);
    const sortScrollRef = useRef(null);
    const [fadeState, setFadeState] = useState('');
    const [sortFadeState, setSortFadeState] = useState('');

    const updateFadeEffect = (ref, setState) => {
        const container = ref.current;
        if (!container) return;

        const { scrollLeft, scrollWidth, clientWidth } = container;
        const isScrollable = scrollWidth > clientWidth;
        const atStart = scrollLeft <= 1;
        const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;

        if (!isScrollable) setState('');
        else if (!atStart && !atEnd) setState('fade-both');
        else if (!atStart) setState('fade-left');
        else if (!atEnd) setState('fade-right');
        else setState('');
    };

    useEffect(() => {
        updateFadeEffect(scrollRef, setFadeState);
        updateFadeEffect(sortScrollRef, setSortFadeState);
        const handleResize = () => {
            updateFadeEffect(scrollRef, setFadeState);
            updateFadeEffect(sortScrollRef, setSortFadeState);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
                              isStable: tagData.isStable,
                              isNewValue: tagData.isNewValue,
                          }
                        : null;
                })
                .filter(r => r !== null),
        [results, tag]
    );

    const filtered = useMemo(() => {
        let data = tagResults;
        if (currentState.status) {
            data = data.filter(r => r.tagStatus === currentState.status);
        }

        if (currentState.sort) {
            data = [...data].sort((a, b) => {
                let valA, valB;
                switch (currentState.sort) {
                    case 'ref':
                        valA = a.ref;
                        valB = b.ref;
                        break;
                    case 'spiderValue':
                        valA = a.spiderValue || '';
                        valB = b.spiderValue || '';
                        break;
                    case 'osmValue':
                        valA = a.osmValue || '';
                        valB = b.osmValue || '';
                        break;
                    case 'osm':
                        valA = a.osmId ? a.osmId.toString() : '';
                        valB = b.osmId ? b.osmId.toString() : '';
                        break;
                    default:
                        return 0;
                }
                const direction = currentState.dir === 'desc' ? -1 : 1;
                return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) * direction;
            });
        }

        return data;
    }, [tagResults, currentState.status, currentState.sort, currentState.dir]);

    const handleSort = (column) => {
        let direction = 'asc';
        if (currentState.sort === column && currentState.dir === 'asc') {
            direction = 'desc';
        }
        setCurrentState(prev => ({ ...prev, sort: column, dir: direction, page: 1 }));
    };

    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    const effectivePage = Math.min(currentState.page, totalPages);
    const pageData = filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

    const { theme, buttonClass } = useTheme();
    const isAuto = theme === 'auto';
    const possibleStatuses = isAuto
        ? ['editMade', 'disallowedSourceUri', 'mismatch', 'updateOsm', 'addToOsm', 'matching']
        : ['disallowedSourceUri', 'mismatch', 'updateOsm', 'addToOsm', 'matching'];
    const showOsmColumns = currentState.status !== 'addToOsm';

    const sortColumns = [
        { key: 'ref', label: t('spider.table.ref') },
        { key: 'spiderValue', label: t('spider.table.spiderValue') },
    ];
    if (showOsmColumns) {
        sortColumns.push({ key: 'osmValue', label: t('spider.table.osmValue') });
    }
    sortColumns.push({ key: 'osm', label: 'OSM' });

    return (
        <div>
            <div class="sticky top-[44px] md:top-[52px] z-20 bg-gray-950 -mx-4 px-4 md:mx-0 md:px-0">
                <div class={`relative overflow-hidden fade-wrapper py-4 ${fadeState}`}>
                    <div
                        ref={scrollRef}
                        onScroll={() => updateFadeEffect(scrollRef, setFadeState)}
                        class="flex overflow-x-auto no-scrollbar gap-2"
                    >
                        {possibleStatuses.map(status => {
                            const count = tagResults.filter(r => r.tagStatus === status).length;
                            if (count === 0 && status === 'disallowedSourceUri') return null;
                            const active = currentState.status === status;
                            return (
                                <button
                                    key={status}
                                    class={`px-4 py-2 rounded-full text-sm font-medium border transition-colors whitespace-nowrap ${
                                        count > 0
                                            ? active
                                                ? `${status === 'editMade' ? 'bg-emerald-600 border-emerald-500' : buttonClass} border-transparent text-white cursor-pointer shadow-md`
                                                : 'border-gray-600 text-gray-300 hover:bg-gray-700 cursor-pointer'
                                            : 'border-gray-800 text-gray-600 cursor-not-allowed'
                                    }`}
                                    onClick={() =>
                                        count > 0 &&
                                        setCurrentState(prev => ({ ...prev, status: active ? null : status, page: 1 }))
                                    }
                                    disabled={count === 0}
                                >
                                    <span>{t(`spider.status.${status}`)}</span>
                                    <span class="ml-2 px-2 py-0.5 rounded-full bg-gray-900 text-xs">{count}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div class="md:hidden">
                <div class={`relative overflow-hidden fade-wrapper pb-4 ${sortFadeState}`}>
                    <div
                        ref={sortScrollRef}
                        onScroll={() => updateFadeEffect(sortScrollRef, setSortFadeState)}
                        class="flex overflow-x-auto no-scrollbar gap-2 pb-2"
                    >
                        {sortColumns.map(col => {
                            const active = currentState.sort === col.key;
                            return (
                                <button
                                    key={col.key}
                                    class={`px-4 py-2 rounded-full text-sm font-medium border transition-colors whitespace-nowrap flex items-center gap-1 ${
                                        active
                                            ? `${buttonClass} text-white shadow-md`
                                            : 'border-gray-600 text-gray-300 hover:bg-gray-700 cursor-pointer'
                                    }`}
                                    onClick={() => handleSort(col.key)}
                                >
                                    {col.label}
                                    <SortIcon column={col.key} currentSort={currentState} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div class="overflow-x-auto md:overflow-x-visible bg-gray-900 rounded-lg shadow mb-6">
                <table class="min-w-full table-auto">
                    <thead class="bg-gray-800 text-gray-400 text-left sticky top-[124px] md:top-[122px] z-10 shadow-sm">
                        <tr class="hidden md:table-row">
                            <th
                                class="px-4 py-3 cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('ref')}
                            >
                                <div class="flex items-center gap-1">
                                    {t('spider.table.ref')}
                                    <SortIcon column="ref" currentSort={currentState} />
                                </div>
                            </th>
                            <th
                                class="px-4 py-3 cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('spiderValue')}
                            >
                                <div class="flex items-center gap-1">
                                    {t('spider.table.spiderValue')}
                                    <SortIcon column="spiderValue" currentSort={currentState} />
                                </div>
                            </th>
                            {showOsmColumns && (
                                <th
                                    class="px-4 py-3 cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort('osmValue')}
                                >
                                    <div class="flex items-center gap-1">
                                        {t('spider.table.osmValue')}
                                        <SortIcon column="osmValue" currentSort={currentState} />
                                    </div>
                                </th>
                            )}
                            <th
                                class="px-4 py-3 cursor-pointer hover:text-white transition-colors md:text-right"
                                onClick={() => handleSort('osm')}
                            >
                                <div class="flex items-center md:justify-end gap-1">
                                    OSM
                                    <SortIcon column="osm" currentSort={currentState} />
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-300 divide-y divide-gray-800">
                        {pageData.map(r => {
                            const suggestedFixes = {};
                            if (
                                r.tagStatus === 'addToOsm' ||
                                r.tagStatus === 'updateOsm' ||
                                r.tagStatus === 'editMade' ||
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
                                                {t('spider.table.spiderValue')}:
                                            </span>
                                            <div class="flex-grow">
                                                <SpiderValue
                                                    value={r.spiderValue}
                                                    history={r.history}
                                                    tag={tag}
                                                    visitedSet={visitedSet}
                                                    isStable={r.isStable}
                                                    isNewValue={r.isNewValue}
                                                />
                                            </div>
                                        </div>
                                    </td>
                                    {showOsmColumns && (
                                        <td class="md:table-cell md:px-4 md:py-3 mb-2 md:mb-0">
                                            <div class="flex md:block">
                                                <span class="md:hidden font-bold text-gray-400 w-16 shrink-0 text-sm">
                                                    {t('spider.table.osmValue')}:
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
