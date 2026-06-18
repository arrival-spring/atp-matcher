import { h } from 'preact';
import { Layout } from './Layout';
import { t } from '../i18n';

/**
 * The static shell for the tier dashboard pages (Auto or Preview dashboard).
 * Renders the layout and scripts required to initialize the interactive dashboard.
 *
 * @param {Object} props - The component props.
 * @param {Object[]} props.dashboardData - Summary data for all spiders in the tier.
 * @param {string} props.atpDate - The date of the latest ATP run.
 * @param {string} props.osmDate - The date of the latest OSM extract.
 * @param {string} props.basePath - The base path for links and assets.
 * @param {string} [props.tier='auto'] - The spider's tier ('auto' or 'preview').
 */
export function DashboardPage({ dashboardData, atpDate, osmDate, basePath, tier = 'auto' }) {
    const isAuto = tier === 'auto';
    const gradientClass = isAuto ? 'from-blue-400 to-teal-400' : 'from-amber-400 to-orange-400';

    const linkColorClass = isAuto ? 'text-blue-400' : 'text-amber-600';

    return h(Layout, { title: t('dashboard.dashboard'), basePath, atpDate, osmDate, tier }, [
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
                __html: `window.initDashboard(${JSON.stringify(dashboardData)}, ${JSON.stringify(tier)});`,
            },
        }),
    ]);
}
