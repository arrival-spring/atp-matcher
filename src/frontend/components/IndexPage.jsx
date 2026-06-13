import { h } from 'preact';
import { Layout } from './Layout';
import { t } from '../i18n';

/**
 * The static shell for the tier index pages (Auto or Preview dashboard).
 * Renders the layout and scripts required to initialize the interactive dashboard.
 *
 * @param {Object} props - The component props.
 * @param {Object[]} props.indexData - Summary data for all spiders in the tier.
 * @param {string} props.atpDate - The date of the latest ATP run.
 * @param {string} props.osmDate - The date of the latest OSM extract.
 * @param {string} props.basePath - The base path for links and assets.
 * @param {string} [props.theme='auto'] - The tier theme ('auto' or 'preview').
 */
export function IndexPage({ indexData, atpDate, osmDate, basePath, theme = 'auto' }) {
    const isAuto = theme === 'auto';
    const gradientClass = isAuto ? 'from-blue-400 to-teal-400' : 'from-amber-400 to-orange-400';

    const linkColorClass = isAuto ? 'text-blue-400' : 'text-amber-600';

    return h(Layout, { title: t('index.dashboard'), basePath, atpDate, osmDate, theme }, [
        h('nav', { class: 'mb-8 mt-4' }, [
            h('a', { href: `../index.html`, class: `${linkColorClass} hover:underline font-bold text-xl` }, '←'),
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
