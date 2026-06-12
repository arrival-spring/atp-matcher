import { h } from 'preact';
import { Layout } from './Layout';
import { t } from '../i18n';

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
    theme = 'auto',
}) {
    const isAuto = theme === 'auto';
    const linkColorClass = isAuto ? 'text-blue-400' : 'text-amber-600';

    return h(Layout, { title: name, basePath, atpDate, osmDate, theme }, [
        h('nav', { class: 'mb-8 mt-4' }, [
            h(
                'a',
                {
                    href: `../index.html`,
                    class: `${linkColorClass} hover:underline font-bold text-xl`,
                },
                '←'
            ),
        ]),
        h('header', { class: 'mb-12' }, [
            h('h1', { class: 'text-4xl font-extrabold mb-2' }, name),
            rejected &&
                h('div', { class: 'bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6 mt-4' }, [
                    h('p', { class: 'font-bold', 'data-t': 'spider.rejected' }, t('spider.rejected')),
                    h('p', { class: 'text-sm mt-1', 'data-t': 'spider.rejectedDesc' }, t('spider.rejectedDesc')),
                    h('p', { class: 'text-sm mt-2 font-mono italic' }, `"${rejected}"`),
                ]),
            isStale &&
                h(
                    'div',
                    { class: 'bg-orange-900/20 border border-orange-500/50 text-orange-200 p-4 rounded-lg mb-6 mt-4' },
                    [
                        h('p', { class: 'font-bold', 'data-t': 'spider.staleData' }, t('spider.staleData')),
                        h(
                            'p',
                            {
                                class: 'text-sm',
                                'data-t': 'spider.staleDataDesc',
                                'data-t-params': JSON.stringify({ date: staleDate.substring(0, 10) }),
                            },
                            t('spider.staleDataDesc', { date: staleDate.substring(0, 10) })
                        ),
                    ]
                ),
            (loadStatus === 'missing' || loadStatus === 'empty') &&
                h('div', { class: 'bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6 mt-4' }, [
                    h('p', { class: 'font-bold', 'data-t': 'spider.noData' }, t('spider.noData')),
                    h(
                        'p',
                        {
                            class: 'text-sm',
                            'data-t': loadStatus === 'missing' ? 'spider.noData404' : 'spider.noDataEmpty',
                        },
                        loadStatus === 'missing' ? t('spider.noData404') : t('spider.noDataEmpty')
                    ),
                ]),
            !isBrandSpider &&
                h('div', { class: 'bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6 mt-4' }, [
                    h('p', { class: 'font-bold', 'data-t': 'spider.notBrandSpider' }, t('spider.notBrandSpider')),
                    h('p', { class: 'text-sm', 'data-t': 'spider.notBrandSpiderDesc' }, [
                        t('spider.notBrandSpiderDesc'),
                    ]),
                ]),
            h('div', { class: 'text-gray-400 text-sm flex gap-4 mt-4' }, [
                h(
                    'a',
                    {
                        href: `https://data.alltheplaces.xyz/runs/latest/output/${name}.geojson`,
                        target: '_blank',
                        class: `${linkColorClass} hover:underline inline-flex items-center`,
                    },
                    [
                        'GeoJSON',
                        h(
                            'svg',
                            { class: 'w-4 h-4 ml-1', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                            [
                                h('path', {
                                    'stroke-linecap': 'round',
                                    'stroke-linejoin': 'round',
                                    'stroke-width': '2',
                                    d: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14',
                                }),
                            ]
                        ),
                    ]
                ),
                h(
                    'a',
                    {
                        href: `https://github.com/alltheplaces/alltheplaces/tree/master/locations/spiders/${name}.py`,
                        target: '_blank',
                        class: `${linkColorClass} hover:underline inline-flex items-center`,
                    },
                    [
                        t('spider.links.source'),
                        h(
                            'svg',
                            { class: 'w-4 h-4 ml-1', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
                            [
                                h('path', {
                                    'stroke-linecap': 'round',
                                    'stroke-linejoin': 'round',
                                    'stroke-width': '2',
                                    d: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14',
                                }),
                            ]
                        ),
                    ]
                ),
            ]),
        ]),
        h('div', { id: 'spider-dashboard-root' }),
        h('script', { type: 'module', src: `${basePath}/assets/spider.js` }),
        h('script', {
            type: 'module',
            dangerouslySetInnerHTML: {
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
        theme: ${JSON.stringify(theme)},
        rejected: ${JSON.stringify(rejected)}
    });`,
            },
        }),
    ]);
}
