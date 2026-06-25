/** @jsx h */
import { h } from 'preact';
import { Layout } from './Layout';
import { t } from '../i18n';

/**
 * The static shell for the tier dashboard pages (Auto or Preview dashboard).
 * Renders the layout and scripts required to initialise the interactive dashboard.
 *
 * @param {Object} props - The component props.
 * @param {Object[]} props.dashboardData - Summary data for all spiders in the tier.
 * @param {string} props.atpDate - The date of the latest ATP run.
 * @param {string} props.osmDate - The date of the latest OSM extract.
 * @param {string} props.basePath - The base path for links and assets.
 * @param {string} [props.tier='auto'] - The spider's tier ('auto' or 'preview').
 */
export function DashboardPage({ dashboardData, atpDate, osmDate, basePath, tier = 'auto' }) {
    return (
        <Layout title={t('dashboard.dashboard')} basePath={basePath} atpDate={atpDate} osmDate={osmDate} tier={tier}>
            <div class="mb-12">
                <p class="text-xl text-gray-400" data-t="subtitle">
                    {t('subtitle')}
                </p>
            </div>
            <div id="dashboard-root" />
            <script type="module" src={`${basePath}/assets/index.js`} />
            <script
                type="module"
                dangerouslySetInnerHTML={{
                    __html: `window.initDashboard(${JSON.stringify(dashboardData)}, ${JSON.stringify(tier)});`,
                }}
            />
        </Layout>
    );
}
