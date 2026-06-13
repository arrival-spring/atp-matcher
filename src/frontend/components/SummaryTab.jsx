import { h } from 'preact';
import { t } from '../i18n';

/**
 * The summary tab component for the spider detail page.
 * Displays an overview of counts for unmapped and unmatched items,
 * and a breakdown of status counts for each importable tag.
 *
 * @param {Object} props - The component props.
 * @param {Object[]} props.results - Matching results between ATP and OSM.
 * @param {string[]} props.importableTags - Array of importable tag names.
 * @param {boolean} props.showUnmatched - Whether to show the unmatched tab link.
 * @param {number} props.unmappedCount - Total count of unmapped items.
 * @param {number} props.unmatchedCount - Total count of unmatched items.
 * @param {Function} props.onTabChange - Callback to switch between tabs.
 */
export function SummaryTab({ results, importableTags, showUnmatched, unmappedCount, unmatchedCount, onTabChange }) {
    const isUniquelyMatched = r => r.matchCount === 1 && !['disallowedSourceUri', 'notABrandSpider'].includes(r.status);

    return (
        <div class="space-y-12">
            <section>
                <h2 class="font-bold mb-6 text-gray-400 uppercase tracking-widest text-xs">
                    {t('spider.summary.overview')}
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <SummaryCard
                        title={t('spider.tabs.unmapped')}
                        value={unmappedCount}
                        onClick={() => onTabChange('unmapped')}
                    />
                    {showUnmatched && (
                        <SummaryCard
                            title={t('spider.tabs.unmatched')}
                            value={unmatchedCount}
                            onClick={() => onTabChange('unmatched')}
                        />
                    )}
                    {results.some(r => r.matchCount > 1) && (
                        <SummaryCard
                            title={t('spider.tabs.duplicateRefs')}
                            value={results.filter(r => r.matchCount > 1).length}
                            onClick={() => onTabChange('duplicate-refs')}
                        />
                    )}
                </div>
            </section>

            <section>
                <h2 class="font-bold mb-6 text-gray-400 uppercase tracking-widest text-xs">
                    {t('spider.summary.tagDetails')}
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {importableTags.map(tag => {
                        const stats = {};
                        results.filter(isUniquelyMatched).forEach(r => {
                            const t = r.tags.find(tt => tt.tag === tag);
                            if (t) stats[t.status] = (stats[t.status] || 0) + 1;
                        });
                        const sortedStatuses = Object.keys(stats).sort((a, b) => {
                            const priorities = [
                                'editMade',
                                'disallowedSourceUri',
                                'mismatch',
                                'updateOsm',
                                'addToOsm',
                                'matching',
                            ];
                            return priorities.indexOf(a) - priorities.indexOf(b);
                        });

                        return (
                            <div
                                key={tag}
                                class="bg-gray-800 p-6 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-700 transition-colors"
                                onClick={() => onTabChange(tag)}
                            >
                                <h3 class="text-xl font-bold mb-4 text-gray-100 font-mono">{tag}</h3>
                                <div class="space-y-2">
                                    {sortedStatuses.map(
                                        status =>
                                            status !== 'notMapped' && (
                                                <div key={status} class="flex justify-between items-center text-sm">
                                                    <span class="text-gray-400">{t(`spider.status.${status}`)}</span>
                                                    <span class="font-mono text-gray-200">{stats[status]}</span>
                                                </div>
                                            )
                                    )}
                                    {Object.keys(stats).length === 0 && (
                                        <p class="text-gray-500 italic">{t('spider.summary.noData')}</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}

/**
 * A card component used for displaying top-level counts in the summary tab.
 *
 * @param {Object} props - The component props.
 * @param {string} props.title - The card title.
 * @param {number} props.value - The count value to display.
 * @param {Function} props.onClick - Callback when the card is clicked.
 */
function SummaryCard({ title, value, onClick }) {
    return (
        <div
            class="bg-gray-900 p-6 rounded-lg border-2 border-gray-800 cursor-pointer hover:bg-gray-800 transition-colors"
            onClick={onClick}
        >
            <h3 class="text-xl font-bold mb-4 text-gray-100">{title}</h3>
            <div class="text-3xl font-mono text-gray-200">{value}</div>
        </div>
    );
}
