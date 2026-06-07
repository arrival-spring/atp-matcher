import { h } from 'preact';

export function Layout({ title, basePath, atpDate, osmDate, children }) {
    return h('html', { lang: "en", class: "dark" }, [
        h('head', null, [
            h('meta', { charset: "UTF-8" }),
            h('meta', { name: "viewport", content: "width=device-width, initial-scale=1.0" }),
            h('title', null, `${title} | ATP-OSM Sync`),
            h('link', {
                rel: "icon",
                href: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔄</text></svg>"
            }),
            h('link', { href: `${basePath}/style.css`, rel: "stylesheet" })
        ]),
        h('body', { class: "bg-gray-950 text-gray-100 min-h-screen p-4 md:p-8" }, [
            h('div', { class: "max-w-7xl mx-auto" }, children),
            h('footer', { class: "max-w-7xl mx-auto mt-12 pt-8 border-t border-gray-800 text-gray-500 text-sm" }, [
                h('div', { class: "flex flex-wrap gap-x-8 gap-y-2" }, [
                    h('div', null, [h('strong', null, "ATP Data:"), " ", atpDate]),
                    h('div', null, [h('strong', null, "OSM Data:"), " ", osmDate])
                ])
            ])
        ])
    ]);
}
