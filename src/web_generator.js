import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function generateHtmlShell(title, basePath, componentName, props) {
    return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | ATP-OSM Sync</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔄</text></svg>">
    <link href="${basePath}/style.css" rel="stylesheet">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen p-4 md:p-8">
    <div id="${componentName}-dashboard-root"></div>
    <script type="module" src="${basePath}/assets/${componentName}.js"></script>
    <script type="module">
        window.init${componentName.charAt(0).toUpperCase() + componentName.slice(1)}Dashboard(${JSON.stringify(props)});
    </script>
</body>
</html>`;
}

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

            const spiderHtml = generateHtmlShell(spider.name, '..', 'spider', {
                spiderName: spider.name,
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
                unmappedFilters: spider.unmappedFilters || [],
                unmatchedFilters: spider.unmatchedFilters || [],
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

        const indexHtml = generateHtmlShell('Dashboard', '.', 'index', {
            allSpiderResults: indexData,
            atpDate,
            osmDate,
        });
        fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml);
    } catch (error) {
        console.error(`Error generating index page: ${error.message}`);
    }

    // Build frontend assets
    try {
        console.log('Building frontend assets with Vite...');
        execSync('npm run build:fe', { stdio: 'inherit' });
    } catch (error) {
        console.error(`Error building frontend assets: ${error.message}`);
    }
}
