import { h } from 'preact';

export function SummaryTab({ results, importableTags, showUnmatched, unmappedCount, unmatchedCount, onTabChange }) {
    const isUniquelyMatched = r =>
        r.matchCount === 1 && !['disallowed source uri', 'not a brand spider'].includes(r.status);

    return (
        <div class="space-y-12">
            <section>
                <h2 class="font-bold mb-6 text-gray-400 uppercase tracking-widest text-xs">Overview</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <SummaryCard title="Unmapped" value={unmappedCount} onClick={() => onTabChange('unmapped')} />
                    {showUnmatched && (
                        <SummaryCard
                            title="Unmatched"
                            value={unmatchedCount}
                            onClick={() => onTabChange('unmatched')}
                        />
                    )}
                    {results.some(r => r.matchCount > 1) && (
                        <SummaryCard
                            title="Duplicate Refs"
                            value={results.filter(r => r.matchCount > 1).length}
                            onClick={() => onTabChange('duplicate-refs')}
                        />
                    )}
                </div>
            </section>

            <section>
                <h2 class="font-bold mb-6 text-gray-400 uppercase tracking-widest text-xs">Tag Details</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {importableTags.map(tag => {
                        const stats = {};
                        results.filter(isUniquelyMatched).forEach(r => {
                            const t = r.tags.find(tt => tt.tag === tag);
                            if (t) stats[t.status] = (stats[t.status] || 0) + 1;
                        });
                        const sortedStatuses = Object.keys(stats).sort((a, b) => {
                            const priorities = [
                                'disallowed source uri',
                                'mismatch',
                                'update OSM',
                                'Add to OSM',
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
                                            status !== 'not mapped' && (
                                                <div key={status} class="flex justify-between items-center text-sm">
                                                    <span class="text-gray-400 capitalize">{status}</span>
                                                    <span class="font-mono text-gray-200">{stats[status]}</span>
                                                </div>
                                            )
                                    )}
                                    {Object.keys(stats).length === 0 && (
                                        <p class="text-gray-500 italic">No data available</p>
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
