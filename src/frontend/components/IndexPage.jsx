import { h } from 'preact';
import { Layout } from './Layout';
import { t } from '../i18n';

export function IndexPage({ indexData, atpDate, osmDate, basePath, theme = 'auto' }) {
    const isAuto = theme === 'auto';
    const gradientClass = isAuto ? 'from-blue-400 to-teal-400' : 'from-amber-400 to-orange-400';

    const linkColorClass = isAuto ? 'text-blue-400' : 'text-amber-600';

    return h(Layout, { title: t('index.dashboard'), basePath, atpDate, osmDate, theme }, [
        h('nav', { class: 'mb-8 mt-4' }, [
            h(
                'a',
                { href: `../index.html`, class: `${linkColorClass} hover:underline font-bold text-xl` },
                '←'
            ),
        ]),
        h('header', { class: 'mb-12 mt-4' }, [
            h(
                'h1',
                {
                    class: `text-5xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r ${gradientClass}`,
                    'data-t': 'title',
                },
                t('title')
            ),
            h('p', { class: 'text-xl text-gray-400', 'data-t': 'subtitle' }, t('subtitle')),
        ]),
        h('div', { id: 'dashboard-root' }),
        h('script', { type: 'module', src: `${basePath}/assets/index.js` }),
        h('script', {
            type: 'module',
            dangerouslySetInnerHTML: {
                __html: `window.initDashboard(${JSON.stringify(indexData)}, ${JSON.stringify(theme)});`,
            },
        }),
    ]);
}
