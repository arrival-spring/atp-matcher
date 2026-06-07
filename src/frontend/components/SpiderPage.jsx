import { h } from 'preact';
import { Layout } from './Layout';

export function SpiderPage({
    name,
    importableTags,
    atpDate,
    osmDate,
    results,
    isBrandSpider,
    isStale,
    staleDate,
    loadStatus,
    showUnmatched,
    unmappedFilters,
    unmatchedFilters,
    basePath,
}) {
    return h(Layout, { title: name, basePath: basePath, atpDate: atpDate, osmDate: osmDate }, [
        h('nav', { class: "mb-8 mt-4" }, [
            h('a', { href: `${basePath}/index.html`, class: "text-blue-400 hover:underline" }, "← Back to Index")
        ]),
        h('header', { class: "mb-12" }, [
            h('h1', { class: "text-4xl font-extrabold mb-2" }, name),
            isStale && h('div', { class: "bg-orange-900/20 border border-orange-500/50 text-orange-200 p-4 rounded-lg mb-6 mt-4" }, [
                h('p', { class: "font-bold" }, "⚠️ Stale Data"),
                h('p', { class: "text-sm" }, `The latest ATP run was empty. Showing data from ${staleDate.substring(0, 10)} instead.`)
            ]),
            (loadStatus === 'missing' || loadStatus === 'empty') && h('div', { class: "bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6 mt-4" }, [
                h('p', { class: "font-bold" }, "❌ No Data Available"),
                h('p', { class: "text-sm" }, loadStatus === 'missing' ? 'The latest ATP run for this spider could not be found (404).' : 'All recent ATP runs for this spider were empty.')
            ]),
            !isBrandSpider && h('div', { class: "bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6 mt-4" }, [
                h('p', { class: "font-bold" }, "❌ Not a Brand Spider"),
                h('p', { class: "text-sm" }, [ "This spider does not have the expected ", h('code', null, "spider:lineage=S_ATP_BRANDS"), " attribute." ])
            ]),
            h('div', { class: "text-gray-400 text-sm flex gap-4 mt-4" }, [
                h('a', {
                    href: `https://data.alltheplaces.xyz/runs/latest/output/${name}.geojson`,
                    target: "_blank",
                    class: "text-blue-400 hover:underline inline-flex items-center"
                }, [
                    "GeoJSON",
                    h('svg', { class: "w-4 h-4 ml-1", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" }, [
                        h('path', { "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" })
                    ])
                ]),
                h('a', {
                    href: `https://github.com/alltheplaces/alltheplaces/tree/master/locations/spiders/${name}.py`,
                    target: "_blank",
                    class: "text-blue-400 hover:underline inline-flex items-center"
                }, [
                    "Spider Source",
                    h('svg', { class: "w-4 h-4 ml-1", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" }, [
                        h('path', { "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" })
                    ])
                ])
            ])
        ]),
        h('div', { id: "spider-dashboard-root" }),
        h('script', { type: "module", src: `${basePath}/assets/spider.js` }),
        h('script', {
            type: "module",
            dangerouslySetInnerHTML: {
                __html: `window.initSpiderDashboard({
        spiderName: ${JSON.stringify(name)},
        results: ${JSON.stringify(results)},
        importableTags: ${JSON.stringify(importableTags)},
        atpDate: ${JSON.stringify(atpDate)},
        showUnmatched: ${showUnmatched},
        unmappedFilters: ${JSON.stringify(unmappedFilters || [])},
        unmatchedFilters: ${JSON.stringify(unmatchedFilters || [])}
    });`,
            },
        })
    ]);
}
