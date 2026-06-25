import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
/** @jsx h */
import { h } from 'preact';
import render from 'preact-render-to-string';
import { DashboardPage } from './frontend/components/DashboardPage.jsx';
import { SpiderPage } from './frontend/components/SpiderPage.jsx';
import { IndexPage } from './frontend/components/IndexPage.jsx';
import { initI18n } from './frontend/i18n.js';

/**
 * Generates the static HTML dashboard and spider detail pages.
 * Handles server-side rendering of Preact components, redirects for mutually exclusive tiers,
 * and asset building with Vite.
 *
 * @param {Object[]} autoResults - Results for spiders in the 'auto' tier.
 * @param {Object[]} previewResults - Results for spiders in the 'preview' tier.
 * @param {string} atpDate - The date of the latest ATP run.
 * @param {string} osmDate - The date of the latest OSM extract.
 * @returns {Promise<void>} A promise that resolves when the webpage generation is complete.
 */
export async function generateWebpage(autoResults, previewResults, atpDate, osmDate) {
    const srcLocalesDir = path.join('src', 'locales');
    const supportedLocales = fs
        .readdirSync(srcLocalesDir)
        .filter(f => f.endsWith('.json') && f !== 'locales.json')
        .map(f => f.replace('.json', ''));

    await initI18n(supportedLocales);
    const outputDir = 'output';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    const autoNames = new Set(autoResults.map(s => s.name));
    const previewNames = new Set(previewResults.map(s => s.name));

    /**
     * Generates individual spider detail pages.
     *
     * @param {Object[]} results - Results for the spiders in the tier.
     * @param {string} subDir - The subdirectory for the tier ('auto' or 'preview').
     * @param {string} tier - The tier name.
     */
    function generateSpiderPages(results, subDir, tier) {
        const subDirPath = path.join(outputDir, subDir);
        if (!fs.existsSync(subDirPath)) {
            fs.mkdirSync(subDirPath, { recursive: true });
        }

        results.forEach(spider => {
            try {
                const spiderDir = path.join(subDirPath, spider.name);
                if (!fs.existsSync(spiderDir)) {
                    fs.mkdirSync(spiderDir, { recursive: true });
                }

                const spiderHtml = render(
                    <SpiderPage {...spider} atpDate={atpDate} osmDate={osmDate} basePath="../.." tier={tier} />
                );
                fs.writeFileSync(path.join(spiderDir, 'index.html'), `<!DOCTYPE html>\n${spiderHtml}`);

                // Generate redirect in the OTHER directory to point to THIS one
                const otherSubDir = subDir === 'auto' ? 'preview' : 'auto';
                const otherSpiderDir = path.join(outputDir, otherSubDir, spider.name);

                // Only create redirect if the other directory doesn't already contain a real spider page
                // (which it shouldn't, as they are mutually exclusive, but this is safer)
                if (
                    (subDir === 'auto' && !previewNames.has(spider.name)) ||
                    (subDir === 'preview' && !autoNames.has(spider.name))
                ) {
                    if (!fs.existsSync(otherSpiderDir)) {
                        fs.mkdirSync(otherSpiderDir, { recursive: true });
                    }
                    // Only write if index.html doesn't exist OR if we are sure it's not a real spider
                    if (!fs.existsSync(path.join(otherSpiderDir, 'index.html'))) {
                        const redirectHtml = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=../../${subDir}/${spider.name}/"></head></html>`;
                        fs.writeFileSync(path.join(otherSpiderDir, 'index.html'), redirectHtml);
                    }
                }
            } catch (error) {
                console.error(`Error generating spider page for ${spider.name} in ${subDir}: ${error.message}`);
            }
        });
    }

    generateSpiderPages(autoResults, 'auto', 'auto');
    generateSpiderPages(previewResults, 'preview', 'preview');

    /**
     * Generates the tier-specific dashboard page.
     *
     * @param {Object[]} results - Results for all spiders in the tier.
     * @param {string} subDir - The subdirectory for the tier.
     * @param {string} tier - The tier name.
     */
    function generateDashboard(results, subDir, tier) {
        try {
            const dashboardData = results.map(s => ({
                name: s.name,
                stabilityColour: s.stabilityColour,
                stabilityScore: s.stabilityScore,
                loadStatus: s.loadStatus,
                isBrandSpider: s.isBrandSpider,
                totalCount: s.totalCount,
                mappedCount: s.mappedCount,
                issuesCount: s.issuesCount,
                brands: s.brands,
                countries: s.countries,
            }));

            const dashboardHtml = render(
                <DashboardPage
                    dashboardData={dashboardData}
                    atpDate={atpDate}
                    osmDate={osmDate}
                    basePath=".."
                    tier={tier}
                />
            );
            fs.writeFileSync(path.join(outputDir, subDir, 'index.html'), `<!DOCTYPE html>\n${dashboardHtml}`);
        } catch (error) {
            console.error(`Error generating dashboard for ${subDir}: ${error.message}`);
        }
    }

    generateDashboard(autoResults, 'auto', 'auto');
    generateDashboard(previewResults, 'preview', 'preview');

    // Generate Index Page
    try {
        /**
         * Calculates global stats for the index page.
         *
         * @param {Object[]} results - Results for a specific tier.
         * @returns {Object} Statistics object with places and brands counts.
         */
        function getStats(results) {
            return {
                places: results.reduce((sum, s) => sum + (s.mappedCount || 0), 0),
                brands: results.length,
            };
        }

        const indexHtml = render(
            <IndexPage
                autoStats={getStats(autoResults)}
                previewStats={getStats(previewResults)}
                atpDate={atpDate}
                osmDate={osmDate}
                basePath="."
            />
        );
        const indexWithScript = `<!DOCTYPE html>\n${indexHtml}
<script type="module" src="./assets/index.js"></script>
<script type="module">window.initIndexPage();</script>`;
        fs.writeFileSync(path.join(outputDir, 'index.html'), indexWithScript);
    } catch (error) {
        console.error(`Error generating index page: ${error.message}`);
    }

    // Build frontend assets
    try {
        console.log('Building frontend assets with Vite...');
        execSync('npm run build:fe', { stdio: 'inherit' });

        // Copy locales to output
        const localesDir = path.join(outputDir, 'locales');
        if (!fs.existsSync(localesDir)) {
            fs.mkdirSync(localesDir, { recursive: true });
        }
        fs.readdirSync(srcLocalesDir).forEach(file => {
            if (file.endsWith('.json')) {
                fs.copyFileSync(path.join(srcLocalesDir, file), path.join(localesDir, file));
            }
        });
        fs.writeFileSync(path.join(localesDir, 'index.json'), JSON.stringify(supportedLocales));
    } catch (error) {
        console.error(`Error building frontend assets: ${error.message}`);
    }
}
