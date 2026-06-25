/** @jsx h */
import { h } from 'preact';
import { Layout } from './Layout';
import { t } from '../i18n';

/**
 * The static shell for the spider detail page.
 * Renders the layout, header information (stale data warnings, rejected status),
 * and the script required to initialise the interactive spider dashboard.
 *
 * @param {Object} props - The component props.
 * @param {string} props.name - The name of the spider.
 * @param {string[]} props.importableTags - Array of importable tag names.
 * @param {string} props.atpDate - The date of the latest ATP run.
 * @param {string} props.osmDate - The date of the latest OSM extract.
 * @param {Object[]} props.results - Pre-calculated matching results for the dashboard.
 * @param {boolean} props.isBrandSpider - Whether this is a brand spider.
 * @param {boolean} props.isStale - Whether the ATP data is considered stale.
 * @param {string|null} props.staleDate - The date when the data became stale.
 * @param {string|null} props.rejected - The reason for rejection, if applicable.
 * @param {string|null} props.loadStatus - Status of data loading ('missing', 'empty').
 * @param {boolean} props.showUnmatched - Whether to show the unmatched tab.
 * @param {number} props.unmappedCount - Count of unmapped items.
 * @param {number} props.unmatchedCount - Count of unmatched items.
 * @param {Object[]} props.unmappedFilters - Pre-calculated filters for unmapped items.
 * @param {Object[]} props.unmatchedFilters - Pre-calculated filters for unmatched items.
 * @param {string} props.basePath - The base path for links and assets.
 * @param {string} [props.tier='auto'] - The spider's tier ('auto' or 'preview').
 */
export function SpiderPage({
    name,
    importableTags,
    atpDate,
    osmDate,
    results,
    isBrandSpider,
    isStale,
    staleDate,
    rejected,
    loadStatus,
    showUnmatched,
    unmappedCount,
    unmatchedCount,
    unmappedFilters,
    unmatchedFilters,
    basePath,
    tier = 'auto',
}) {
    const isAuto = tier === 'auto';
    const linkColourClass = isAuto ? 'text-blue-400' : 'text-amber-600';

    return (
        <Layout title={name} basePath={basePath} atpDate={atpDate} osmDate={osmDate} tier={tier} spiderName={name}>
            <div class="mb-12">
                {rejected && (
                    <div class="bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6 mt-4">
                        <p class="font-bold" data-t="spider.rejected">
                            {t('spider.rejected')}
                        </p>
                        <p class="text-sm mt-1" data-t="spider.rejectedDesc">
                            {t('spider.rejectedDesc')}
                        </p>
                        <p class="text-sm mt-2 font-mono italic">{`"${rejected}"`}</p>
                    </div>
                )}
                {isStale && (
                    <div class="bg-orange-900/20 border border-orange-500/50 text-orange-200 p-4 rounded-lg mb-6 mt-4">
                        <p class="font-bold" data-t="spider.staleData">
                            {t('spider.staleData')}
                        </p>
                        <p
                            class="text-sm"
                            data-t="spider.staleDataDesc"
                            data-t-params={JSON.stringify({ date: staleDate.substring(0, 10) })}
                        >
                            {t('spider.staleDataDesc', { date: staleDate.substring(0, 10) })}
                        </p>
                    </div>
                )}
                {(loadStatus === 'missing' || loadStatus === 'empty') && (
                    <div class="bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6 mt-4">
                        <p class="font-bold" data-t="spider.noData">
                            {t('spider.noData')}
                        </p>
                        <p
                            class="text-sm"
                            data-t={loadStatus === 'missing' ? 'spider.noData404' : 'spider.noDataEmpty'}
                        >
                            {loadStatus === 'missing' ? t('spider.noData404') : t('spider.noDataEmpty')}
                        </p>
                    </div>
                )}
                {!isBrandSpider && (
                    <div class="bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6 mt-4">
                        <p class="font-bold" data-t="spider.notBrandSpider">
                            {t('spider.notBrandSpider')}
                        </p>
                        <p class="text-sm" data-t="spider.notBrandSpiderDesc">
                            {t('spider.notBrandSpiderDesc')}
                        </p>
                    </div>
                )}
                <div class="text-gray-400 text-sm flex gap-4 mt-4">
                    <a
                        href={`https://data.alltheplaces.xyz/runs/latest/output/${name}.geojson`}
                        target="_blank"
                        class={`${linkColourClass} hover:underline inline-flex items-center`}
                    >
                        GeoJSON
                        <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                        </svg>
                    </a>
                    <a
                        href={`https://github.com/alltheplaces/alltheplaces/tree/master/locations/spiders/${name}.py`}
                        target="_blank"
                        class={`${linkColourClass} hover:underline inline-flex items-center`}
                    >
                        <span data-t="spider.links.source">{t('spider.links.source')}</span>
                        <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                        </svg>
                    </a>
                </div>
            </div>
            <div id="spider-dashboard-root" />
            <script type="module" src={`${basePath}/assets/spider.js`} />
            <script
                type="module"
                dangerouslySetInnerHTML={{
                    __html: `window.initSpiderDashboard({
        spiderName: ${JSON.stringify(name)},
        results: ${JSON.stringify(results)},
        importableTags: ${JSON.stringify(importableTags)},
        atpDate: ${JSON.stringify(atpDate)},
        showUnmatched: ${showUnmatched},
        unmappedCount: ${unmappedCount || 0},
        unmatchedCount: ${unmatchedCount || 0},
        unmappedFilters: ${JSON.stringify(unmappedFilters || [])},
        unmatchedFilters: ${JSON.stringify(unmatchedFilters || [])},
        tier: ${JSON.stringify(tier)},
        rejected: ${JSON.stringify(rejected)}
    });`,
                }}
            />
        </Layout>
    );
}
