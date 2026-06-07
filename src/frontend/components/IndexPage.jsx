import { h } from 'preact';
import { Layout } from './Layout';

export function IndexPage({ indexData, atpDate, osmDate, basePath }) {
    return h(Layout, { title: "Dashboard", basePath: basePath, atpDate: atpDate, osmDate: osmDate }, [
        h('header', { class: "mb-12 mt-4" }, [
            h('h1', { class: "text-5xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400" }, "ATP-OSM Sync"),
            h('p', { class: "text-xl text-gray-400" }, "Data synchronization between All The Places and OpenStreetMap")
        ]),
        h('div', { id: "dashboard-root" }),
        h('script', { type: "module", src: `${basePath}/assets/index.js` }),
        h('script', {
            type: "module",
            dangerouslySetInnerHTML: {
                __html: `window.initDashboard(${JSON.stringify(indexData)});`,
            },
        })
    ]);
}
