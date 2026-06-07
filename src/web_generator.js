import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { h } from 'preact';
import render from 'preact-render-to-string';
import { IndexPage } from './frontend/components/IndexPage.jsx';
import { SpiderPage } from './frontend/components/SpiderPage.jsx';

export function generateWebpage(allSpiderResults, atpDate, osmDate) {
    const outputDir = 'output';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    // Generate Spider Pages
    allSpiderResults.forEach(spider => {
        try {
            const spiderDir = path.join(outputDir, spider.name);
            if (!fs.existsSync(spiderDir)) {
                fs.mkdirSync(spiderDir, { recursive: true });
            }

            const spiderHtml = render(
                h(SpiderPage, {
                    name: spider.name,
                    importableTags: spider.importableTags,
                    atpDate,
                    osmDate,
                    results: spider.results,
                    isBrandSpider: spider.isBrandSpider,
                    isStale: spider.isStale,
                    staleDate: spider.staleDate,
                    loadStatus: spider.loadStatus,
                    showUnmatched: spider.showUnmatched,
                    unmappedCount: spider.unmappedCount,
                    unmatchedCount: spider.unmatchedCount,
                    unmappedFilters: spider.unmappedFilters,
                    unmatchedFilters: spider.unmatchedFilters,
                    basePath: '..',
                })
            );
            fs.writeFileSync(path.join(spiderDir, 'index.html'), `<!DOCTYPE html>\n${spiderHtml}`);
        } catch (error) {
            console.error(`Error generating spider page for ${spider.name}: ${error.message}`);
        }
    });

    // Generate Index Page
    try {
        const indexData = allSpiderResults.map(s => ({
            name: s.name,
            stabilityColor: s.stabilityColor,
            loadStatus: s.loadStatus,
            isBrandSpider: s.isBrandSpider,
            totalCount: s.totalCount,
            mappedCount: s.mappedCount,
            issuesCount: s.issuesCount,
            automaticUpdatesCount: s.automaticUpdatesCount,
        }));

        const indexHtml = render(
            h(IndexPage, {
                indexData,
                atpDate,
                osmDate,
                basePath: '.',
            })
        );
        fs.writeFileSync(path.join(outputDir, 'index.html'), `<!DOCTYPE html>\n${indexHtml}`);
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
