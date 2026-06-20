/** @jsx h */
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

    function Card({ type, title, description, stats }) {
        const isAuto = type === 'auto';
        const accentClass = isAuto ? 'border-emerald-500' : 'border-amber-500';
        const hoverAccentClass = isAuto ? 'hover:border-emerald-400' : 'hover:border-amber-400';
        const link = isAuto ? `${basePath}/auto/` : `${basePath}/preview/`;

        return (
            <a
                href={link}
                class={`block p-6 bg-gray-900 border-t-4 ${accentClass} ${hoverAccentClass} rounded-lg shadow-lg transition-colors`}
            >
                <h2 class="text-2xl font-bold mb-4" data-t={`index.${type}.title`}>
                    {title}
                </h2>
                <p class="text-gray-400 mb-6" data-t={`index.${type}.description`}>
                    {description}
                </p>
                <div class="text-gray-300" data-t={`index.${type}.stats`}>
                    {(() => {
                        const statsStr = t(`index.${type}.stats`);
                        const parts = statsStr.split(/({{\s*[xy]\s*}})/);
                        return parts.map(part => {
                            if (part.match(/{{\s*x\s*}}/)) {
                                return (
                                    <span class="text-4xl font-bold text-white" data-t-ignore>
                                        {stats.places}
                                    </span>
                                );
                            }
                            if (part.match(/{{\s*y\s*}}/)) {
                                return (
                                    <span class="text-xl" data-t-ignore>
                                        {stats.brands}
                                    </span>
                                );
                            }
                            return part;
                        });
                    })()}
                </div>
            </a>
        );
    }

    return (
        <Layout title={t('title')} basePath={basePath} atpDate={atpDate} osmDate={osmDate} isIndex={true}>
            <div class="mb-12">
                <p class="text-xl text-gray-400 max-w-3xl mb-6" data-t="index.summary">
                    {t('index.summary')}
                </p>
                <div class="flex gap-4 mb-12">
                    <a
                        href={gitHubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-blue-400 hover:text-blue-300 transition-colors"
                        data-t="index.githubLink"
                    >
                        {t('index.githubLink')}
                    </a>
                </div>

                <div id="global-search-root" class="mb-12" />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card
                    type="auto"
                    title={t('index.auto.title')}
                    description={t('index.auto.description')}
                    stats={autoStats}
                />
                <Card
                    type="preview"
                    title={t('index.preview.title')}
                    description={t('index.preview.description')}
                    stats={previewStats}
                />
            </div>
        </Layout>
    );
}
