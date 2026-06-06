import { generateWebpage } from './src/web_generator.js';

const mockResults = [
    {
        name: 'kfc_za',
        importableTags: ['phone'],
        results: [
            {
                ref: '123',
                status: 'matching',
                matchCount: 1,
                osmId: 'n12345',
                tags: [{ tag: 'phone', status: 'matching', osmValue: '123', spiderValue: '123' }]
            }
        ],
        isBrandSpider: true,
        lineage: 'S_ATP_BRANDS',
        loadStatus: null,
        stabilityColor: 'green',
        unmappedCount: 5,
        unmatchedCount: 2,
        totalCount: 6,
        mappedCount: 1,
        issuesCount: 0,
        automaticUpdatesCount: 0,
        showUnmatched: true,
        unmappedFilters: [{ label: 'All brands', count: 5, brand: null, wikidata: null }],
        unmatchedFilters: [{ label: 'All brands', count: 2, brand: null, wikidata: null }]
    }
];

generateWebpage(mockResults, '2025-01-01', '2025-01-01');
console.log('Mock pages generated.');
