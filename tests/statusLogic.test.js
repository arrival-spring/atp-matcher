import { processSpiderResults } from '../src/sync.js';

describe('processSpiderResults Status Logic', () => {
    const runs = [
        { run_id: '2024-01-01T00:00:00Z' },
        { run_id: '2024-01-02T00:00:00Z' },
        { run_id: '2024-01-03T00:00:00Z' },
        { run_id: '2024-01-04T00:00:00Z' }
    ];

    const spider = {
        name: 'test-spider',
        importableTags: ['opening_hours', 'phone', 'website'],
        source_uri: ['example.com']
    };

    const baseSpiderData = {
        latestRun: {
            features: [],
            dataset_attributes: { 'spider:lineage': 'S_ATP_BRANDS' }
        },
        spiderMaps: [new Map(), new Map(), new Map(), new Map()],
        config: spider,
        isBrandSpider: true,
        lineage: 'S_ATP_BRANDS'
    };

    test('Add to OSM: should be "Add to OSM" if last two runs are stable and value is new', async () => {
        const feature = {
            properties: {
                ref: '123',
                website: 'https://new.com',
                '@source_uri': 'https://example.com'
            }
        };
        const spiderData = {
            ...baseSpiderData,
            latestRun: { ...baseSpiderData.latestRun, features: [feature] },
            spiderMaps: [
                new Map(),
                new Map(),
                new Map([['123', { ref: '123', website: 'https://new.com' }]]),
                new Map([['123', { ref: '123', website: 'https://new.com' }]])
            ]
        };
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: { brand: 'Test', 'brand:wikidata': 'Q1' } }]]]);
        const safeEdits = {};

        const { results } = await processSpiderResults(spiderData, spiderMatches, runs, safeEdits);
        const websiteTag = results[0].tags.find(t => t.tag === 'website');
        expect(websiteTag.status).toBe('Add to OSM');
        expect(results[0].status).toBe('Add to OSM');
    });

    test('Add to OSM: should be "mismatch" if last two runs are not stable', async () => {
        const feature = {
            properties: {
                ref: '123',
                website: 'https://new.com',
                '@source_uri': 'https://example.com'
            }
        };
        const spiderData = {
            ...baseSpiderData,
            latestRun: { ...baseSpiderData.latestRun, features: [feature] },
            spiderMaps: [
                new Map(),
                new Map(),
                new Map([['123', { ref: '123', website: 'https://old.com' }]]),
                new Map([['123', { ref: '123', website: 'https://new.com' }]])
            ]
        };
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: { brand: 'Test', 'brand:wikidata': 'Q1' } }]]]);

        const { results } = await processSpiderResults(spiderData, spiderMatches, runs, {});
        const websiteTag = results[0].tags.find(t => t.tag === 'website');
        expect(websiteTag.status).toBe('mismatch');
    });

    test('update OSM: should be "update OSM" if all 4 runs exist and meet stability/match criteria', async () => {
        const feature = {
            properties: {
                ref: '123',
                website: 'https://new.com',
                '@source_uri': 'https://example.com'
            }
        };
        const spiderData = {
            ...baseSpiderData,
            latestRun: { ...baseSpiderData.latestRun, features: [feature] },
            spiderMaps: [
                new Map([['123', { ref: '123', website: 'https://old.com' }]]),
                new Map([['123', { ref: '123', website: 'https://old.com' }]]),
                new Map([['123', { ref: '123', website: 'https://new.com' }]]),
                new Map([['123', { ref: '123', website: 'https://new.com' }]])
            ]
        };
        // OSM has 'old.com', matches first two runs
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: { brand: 'Test', 'brand:wikidata': 'Q1', website: 'https://old.com' } }]]]);

        const { results } = await processSpiderResults(spiderData, spiderMatches, runs, {});
        const websiteTag = results[0].tags.find(t => t.tag === 'website');
        expect(websiteTag.status).toBe('update OSM');
    });

    test('update OSM: should be "mismatch" if any of 4 runs is null', async () => {
        const feature = {
            properties: {
                ref: '123',
                website: 'https://new.com',
                '@source_uri': 'https://example.com'
            }
        };
        const spiderData = {
            ...baseSpiderData,
            latestRun: { ...baseSpiderData.latestRun, features: [feature] },
            spiderMaps: [
                new Map(), // Run 1 is missing value
                new Map([['123', { ref: '123', website: 'https://old.com' }]]),
                new Map([['123', { ref: '123', website: 'https://new.com' }]]),
                new Map([['123', { ref: '123', website: 'https://new.com' }]])
            ]
        };
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: { brand: 'Test', 'brand:wikidata': 'Q1', website: 'https://old.com' } }]]]);

        const { results } = await processSpiderResults(spiderData, spiderMatches, runs, {});
        const websiteTag = results[0].tags.find(t => t.tag === 'website');
        expect(websiteTag.status).toBe('mismatch');
    });

    test('PH Rule: should be "mismatch" if OSM has PH even if update criteria met', async () => {
        const feature = {
            properties: {
                ref: '123',
                opening_hours: 'Mo-Fr 09:00-18:00',
                '@source_uri': 'https://example.com'
            }
        };
        const spiderData = {
            ...baseSpiderData,
            latestRun: { ...baseSpiderData.latestRun, features: [feature] },
            spiderMaps: [
                new Map([['123', { ref: '123', opening_hours: 'Mo-Fr 08:00-17:00' }]]),
                new Map([['123', { ref: '123', opening_hours: 'Mo-Fr 08:00-17:00' }]]),
                new Map([['123', { ref: '123', opening_hours: 'Mo-Fr 09:00-18:00' }]]),
                new Map([['123', { ref: '123', opening_hours: 'Mo-Fr 09:00-18:00' }]])
            ]
        };
        // OSM has PH, and matches old value (semantically)
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: { brand: 'Test', 'brand:wikidata': 'Q1', opening_hours: 'Mo-Fr 08:00-17:00; PH off' } }]]]);

        const { results } = await processSpiderResults(spiderData, spiderMatches, runs, {});
        const ohTag = results[0].tags.find(t => t.tag === 'opening_hours');
        expect(ohTag.status).toBe('mismatch');
    });

    test('PH Rule: should be "matching" if values match despite PH in OSM', async () => {
        const feature = {
            properties: {
                ref: '123',
                opening_hours: 'Mo-Fr 08:00-17:00',
                '@source_uri': 'https://example.com'
            }
        };
        const spiderData = {
            ...baseSpiderData,
            latestRun: { ...baseSpiderData.latestRun, features: [feature] },
            spiderMaps: [
                new Map(), new Map(), new Map(),
                new Map([['123', { ref: '123', opening_hours: 'Mo-Fr 08:00-17:00' }]])
            ]
        };
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: { brand: 'Test', 'brand:wikidata': 'Q1', opening_hours: 'Mo-Fr 08:00-17:00; PH off' } }]]]);

        const { results } = await processSpiderResults(spiderData, spiderMatches, runs, {});
        const ohTag = results[0].tags.find(t => t.tag === 'opening_hours');
        expect(ohTag.status).toBe('matching');
    });
});
