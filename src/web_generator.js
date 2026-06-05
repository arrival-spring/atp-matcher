import fs from 'fs';
import path from 'path';
import eta from './eta.js';

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

            const spiderHtml = eta.render('./spider', {
                title: spider.name,
                name: spider.name,
                importableTags: spider.importableTags,
                atpDate,
                osmDate,
                results: spider.results,
                isBrandSpider: spider.isBrandSpider,
                lineage: spider.lineage,
                isStale: spider.isStale,
                staleDate: spider.staleDate,
                loadStatus: spider.loadStatus,
                showUnmatched: spider.showUnmatched,
                unmappedCount: spider.unmappedCount,
                unmatchedCount: spider.unmatchedCount,
                basePath: '..',
            });
            fs.writeFileSync(path.join(spiderDir, 'index.html'), spiderHtml);
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

        const indexHtml = eta.render('./index', {
            title: 'Dashboard',
            indexData,
            atpDate,
            osmDate,
            basePath: '.',
        });
        fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml);
    } catch (error) {
        console.error(`Error generating index page: ${error.message}`);
    }

    // Copy JS files
    try {
        fs.copyFileSync(path.join('src', 'templates', 'spider.js'), path.join(outputDir, 'spider.js'));
        fs.copyFileSync(path.join('src', 'templates', 'index.js'), path.join(outputDir, 'index.js'));
        fs.copyFileSync(path.join('src', 'templates', 'utils.js'), path.join(outputDir, 'utils.js'));
    } catch (error) {
        console.error(`Error copying template JS files: ${error.message}`);
    }
}
