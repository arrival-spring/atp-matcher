import { h } from 'preact';
import { useRef, useState, useEffect } from 'preact/hooks';
import { t } from '../i18n';

export function TabNavigation({
    activeTab,
    onTabChange,
    showUnmatched,
    importableTags,
    hasDuplicates,
    unmappedCount,
    unmatchedCount,
}) {
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
        <div class="sticky top-0 z-30 bg-gray-950 border-b border-gray-700 -mx-4 px-4 md:mx-0 md:px-0">
            <div class={`relative overflow-hidden fade-wrapper ${fadeState}`}>
                <ul
                    ref={scrollRef}
                    onScroll={updateFadeEffect}
                    class="flex overflow-x-auto no-scrollbar -mb-px text-sm font-medium text-center"
                    role="tablist"
                >
                    <TabButton
                        id="summary"
                        label={t('spider.tabs.summary')}
                        active={activeTab === 'summary'}
                        onClick={() => onTabChange('summary')}
                    />
                    <TabButton
                        id="unmapped"
                        label={t('spider.tabs.unmapped')}
                        count={activeTab === 'unmapped' ? unmappedCount : null}
                        active={activeTab === 'unmapped'}
                        onClick={() => onTabChange('unmapped')}
                    />
                    {showUnmatched && (
                        <TabButton
                            id="unmatched"
                            label={t('spider.tabs.unmatched')}
                            count={activeTab === 'unmatched' ? unmatchedCount : null}
                            active={activeTab === 'unmatched'}
                            onClick={() => onTabChange('unmatched')}
                        />
                    )}
                    {hasDuplicates && (
                        <li class="shrink-0 border-r border-gray-700 pr-2 mr-2" role="presentation">
                            <TabButton
                                id="duplicate-refs"
                                label={t('spider.tabs.duplicateRefs')}
                                active={activeTab === 'duplicate-refs'}
                                onClick={() => onTabChange('duplicate-refs')}
                            />
                        </li>
                    )}
                    {!hasDuplicates && <li class="shrink-0 border-r border-gray-700 mr-2" role="presentation" />}
                    {importableTags.map(tag => (
                        <TabButton
                            key={tag}
                            id={tag}
                            label={tag}
                            active={activeTab === tag}
                            onClick={() => onTabChange(tag)}
                            isMono
                        />
                    ))}
                </ul>
            </div>
        </div>
    );
}

function TabButton({ id, label, count, active, onClick, isMono }) {
    return (
        <li class="shrink-0" role="presentation">
            <button
                class={`inline-block p-3 md:p-4 border-b-2 rounded-t-lg transition-colors cursor-pointer whitespace-nowrap ${
                    active
                        ? 'text-blue-500 border-blue-500'
                        : 'border-transparent hover:text-gray-300 hover:border-gray-300'
                } ${isMono ? 'font-mono' : ''}`}
                onClick={onClick}
                type="button"
            >
                {label}{' '}
                {count !== null && count !== undefined && (
                    <span class="tab-count ml-1 opacity-60 text-xs">({count})</span>
                )}
            </button>
        </li>
    );
}
