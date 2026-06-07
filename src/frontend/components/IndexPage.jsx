import { h } from 'preact';
import { Layout } from './Layout';
import { t } from '../i18n';

export function IndexPage({ indexData, atpDate, osmDate, basePath }) {
    return h(Layout, { title: t('index.dashboard'), basePath: basePath, atpDate: atpDate, osmDate: osmDate }, [
        h('header', { class: 'mb-12 mt-4' }, [
            h(
                'h1',
                {
                    class: 'text-5xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400',
                },
                t('title')
            ),
            h('p', { class: 'text-xl text-gray-400' }, t('subtitle')),
        ]),
        h('div', { id: 'dashboard-root' }),
        h('script', { type: 'module', src: `${basePath}/assets/index.js` }),
        h('script', {
            type: 'module',
            dangerouslySetInnerHTML: {
                __html: `window.initDashboard(${JSON.stringify(indexData)});`,
            },
        }),
    ]);
}
