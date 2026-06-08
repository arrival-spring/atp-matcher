import { h } from 'preact';
import { Layout } from './Layout';
import { t } from '../i18n';

export function LandingPage({ autoStats, previewStats, atpDate, osmDate, basePath }) {
    const gitHubUrl = 'https://github.com/placeholder/atp-osm-sync'; // Placeholder as requested

    const Card = ({ type, title, description, stats }) => {
        const isAuto = type === 'auto';
        const accentClass = isAuto ? 'border-emerald-500' : 'border-amber-500';
        const hoverAccentClass = isAuto ? 'hover:border-emerald-400' : 'hover:border-amber-400';
        const link = isAuto ? `${basePath}/auto/` : `${basePath}/preview/`;

        return h('a', {
            href: link,
            class: `block p-6 bg-gray-900 border-t-4 ${accentClass} ${hoverAccentClass} rounded-lg shadow-lg transition-colors`
        }, [
            h('h2', { class: 'text-2xl font-bold mb-4' }, title),
            h('p', { class: 'text-gray-400 mb-6' }, description),
            h('div', {
                class: 'text-gray-300',
                dangerouslySetInnerHTML: {
                    __html: t(`landing.${type}.stats`, {
                        x: `<span class="text-4xl font-bold text-white">${stats.places}</span>`,
                        y: stats.brands
                    })
                }
            })
        ]);
    };

    return h(Layout, { title: t('title'), basePath, atpDate, osmDate }, [
        h('header', { class: 'mb-12' }, [
            h('h1', { class: 'text-4xl font-extrabold mb-4' }, t('title')),
            h('p', { class: 'text-xl text-gray-400 max-w-3xl mb-6' }, t('landing.summary')),
            h('div', { class: 'flex gap-4' }, [
                h('a', {
                    href: gitHubUrl,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    class: 'text-blue-400 hover:text-blue-300 transition-colors'
                }, t('landing.githubLink')),
            ])
        ]),
        h('div', { class: 'grid grid-cols-1 md:grid-cols-2 gap-8' }, [
            h(Card, {
                type: 'auto',
                title: t('landing.auto.title'),
                description: t('landing.auto.description'),
                stats: autoStats
            }),
            h(Card, {
                type: 'preview',
                title: t('landing.preview.title'),
                description: t('landing.preview.description'),
                stats: previewStats
            })
        ])
    ]);
}
