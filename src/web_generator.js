import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { h } from 'preact';
import render from 'preact-render-to-string';
import { IndexPage } from './frontend/components/IndexPage.jsx';
import { SpiderPage } from './frontend/components/SpiderPage.jsx';
import { LandingPage } from './frontend/components/LandingPage.jsx';
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
 * @returns {Promise<void>}
 */
export async function generateWebpage(autoResults, previewResults, atpDate, osmDate) {
    await initI18n();
    const outputDir = 'output';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    const autoNames = new Set(autoResults.map(s => s.name));
    const previewNames = new Set(previewResults.map(s => s.name));

    const generateSpiderPages = (results, subDir, tier) => {
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
                    h(SpiderPage, {
                        ...spider,
                        atpDate,
                        osmDate,
                        basePath: '../..',
                        tier,
                    })
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
    };

    generateSpiderPages(autoResults, 'auto', 'auto');
    generateSpiderPages(previewResults, 'preview', 'preview');

    const generateDashboard = (results, subDir, tier) => {
        try {
            const indexData = results.map(s => ({
                name: s.name,
                stabilityColor: s.stabilityColor,
                stabilityScore: s.stabilityScore,
                loadStatus: s.loadStatus,
                isBrandSpider: s.isBrandSpider,
                totalCount: s.totalCount,
                mappedCount: s.mappedCount,
                issuesCount: s.issuesCount,
                brands: s.brands,
                countries: s.countries,
            }));

            const indexHtml = render(
                h(IndexPage, {
                    indexData,
                    atpDate,
                    osmDate,
                    basePath: '..',
                    tier,
                })
            );
            fs.writeFileSync(path.join(outputDir, subDir, 'index.html'), `<!DOCTYPE html>\n${indexHtml}`);
        } catch (error) {
            console.error(`Error generating dashboard for ${subDir}: ${error.message}`);
        }
    };

    generateDashboard(autoResults, 'auto', 'auto');
    generateDashboard(previewResults, 'preview', 'preview');

    // Generate Landing Page
    try {
        const getStats = results => ({
            places: results.reduce((sum, s) => sum + (s.mappedCount || 0), 0),
            brands: results.length,
        });

        const landingHtml = render(
            h(LandingPage, {
                autoStats: getStats(autoResults),
                previewStats: getStats(previewResults),
                atpDate,
                osmDate,
                basePath: '.',
            })
        );
        const landingWithScript = `<!DOCTYPE html>\n${landingHtml}
<script type="module" src="./assets/index.js"></script>
<script type="module">window.initLandingPage();</script>`;
        fs.writeFileSync(path.join(outputDir, 'index.html'), landingWithScript);
    } catch (error) {
        console.error(`Error generating landing page: ${error.message}`);
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
        const srcLocalesDir = path.join('src', 'locales');
        fs.readdirSync(srcLocalesDir).forEach(file => {
            if (file.endsWith('.json')) {
                fs.copyFileSync(path.join(srcLocalesDir, file), path.join(localesDir, file));
            }
        });
    } catch (error) {
        console.error(`Error building frontend assets: ${error.message}`);
    }
}
