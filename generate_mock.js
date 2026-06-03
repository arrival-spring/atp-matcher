
import fs from 'fs';
import path from 'path';
import { Eta } from 'eta';

const eta = new Eta({
    views: path.join(process.cwd(), 'src', 'templates'),
    cache: false,
});

const indexData = [
    {
        name: "test_spider",
        stabilityColor: "green",
        loadStatus: null,
        isBrandSpider: true,
        totalCount: 100,
        mappedCount: 80,
        issuesCount: 10,
        automaticUpdatesCount: 5
    }
];

const spiderResults = [
    {
        ref: "REF1",
        status: "mismatch",
        matchCount: 1,
        tags: [
            {
                tag: "opening_hours",
                status: "mismatch",
                spiderValue: "Mo-Fr 08:00-18:00",
                osmValue: "Mo-Fr 09:00-17:00",
                history: [
                    { date: "2024-01-01", value: "Mo-Fr 08:00-18:00" },
                    { date: "2024-01-08", value: "Mo-Fr 08:00-18:00" }
                ]
            }
        ],
        osmId: "n123"
    },
    {
        ref: "REF2",
        status: "not mapped",
        matchCount: 0,
        allAtpTags: { brand: "Test Brand", ref: "REF2" }
    }
];

const atpDate = "2024-05-01T00:00:00Z";
const osmDate = "2024-05-01T12:00:00Z";

if (!fs.existsSync('output')) fs.mkdirSync('output');

const indexHtml = eta.render('./index', {
    title: 'Dashboard',
    indexData,
    atpDate,
    osmDate,
});
fs.writeFileSync('output/index.html', indexHtml);

const spiderHtml = eta.render('./spider', {
    title: "test_spider",
    name: "test_spider",
    importableTags: ["opening_hours"],
    atpDate,
    osmDate,
    results: spiderResults,
    isBrandSpider: true,
    lineage: "S_ATP_BRANDS",
    isStale: false,
    staleDate: null,
    loadStatus: null,
});
fs.writeFileSync('output/test_spider.html', spiderHtml);

console.log("Mock pages generated in output/");
