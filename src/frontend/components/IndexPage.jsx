import { h } from 'preact';
import { Layout } from './Layout';
import { t } from '../i18n';

/**
 * The index page component for the project.
 * Displays global statistics, a global search bar, and links to the 'auto' and 'preview' tiers.
 *
 * @param {Object} props - The component props.
 * @param {Object} props.autoStats - Statistics for the 'auto' tier (places and brands counts).
 * @param {Object} props.previewStats - Statistics for the 'preview' tier (places and brands counts).
 * @param {string} props.atpDate - The date of the latest ATP run.
 * @param {string} props.osmDate - The date of the latest OSM extract.
 * @param {string} props.basePath - The base path for links and assets.
 */
export function IndexPage({ autoStats, previewStats, atpDate, osmDate, basePath }) {
    const gitHubUrl = 'https://github.com/placeholder/atp-osm-sync'; // Placeholder as requested

    const Card = ({ type, title, description, stats }) => {
        const isAuto = type === 'auto';
        const accentClass = isAuto ? 'border-emerald-500' : 'border-amber-500';
        const hoverAccentClass = isAuto ? 'hover:border-emerald-400' : 'hover:border-amber-400';
        const link = isAuto ? `${basePath}/auto/` : `${basePath}/preview/`;

        return h(
            'a',
            {
                href: link,
                class: `block p-6 bg-gray-900 border-t-4 ${accentClass} ${hoverAccentClass} rounded-lg shadow-lg transition-colors`,
            },
            [
                h('h2', { class: 'text-2xl font-bold mb-4', 'data-t': `index.${type}.title` }, title),
                h('p', { class: 'text-gray-400 mb-6', 'data-t': `index.${type}.description` }, description),
                h('div', {
                    class: 'text-gray-300',
                    'data-t': `index.${type}.stats`,
                    'data-t-html': 'true',
                    'data-t-params': JSON.stringify({
                        x: `<span class="text-4xl font-bold text-white">${stats.places}</span>`,
                        y: stats.brands,
                    }),
                    dangerouslySetInnerHTML: {
                        __html: t(`index.${type}.stats`, {
                            x: `<span class="text-4xl font-bold text-white">${stats.places}</span>`,
                            y: stats.brands,
                        }),
                    },
                }),
            ]
        );
    };

    return h(Layout, { title: t('title'), basePath, atpDate, osmDate }, [
        h('header', { class: 'mb-12' }, [
            h('h1', { class: 'text-4xl font-extrabold mb-4', 'data-t': 'title' }, t('title')),
            h(
                'p',
                { class: 'text-xl text-gray-400 max-w-3xl mb-6', 'data-t': 'index.summary' },
                t('index.summary')
            ),
            h('div', { class: 'flex gap-4 mb-12' }, [
                h(
                    'a',
                    {
                        href: gitHubUrl,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        class: 'text-blue-400 hover:text-blue-300 transition-colors',
                        'data-t': 'index.githubLink',
                    },
                    t('index.githubLink')
                ),
            ]),

            h('div', { id: 'global-search-root', class: 'mb-12' }),
        ]),
        h('div', { class: 'grid grid-cols-1 md:grid-cols-2 gap-8' }, [
            h(Card, {
                type: 'auto',
                title: t('index.auto.title'),
                description: t('index.auto.description'),
                stats: autoStats,
            }),
            h(Card, {
                type: 'preview',
                title: t('index.preview.title'),
                description: t('index.preview.description'),
                stats: previewStats,
            }),
        ]),
    ]);
}
