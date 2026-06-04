import { processSpiderResults } from '../src/sync.js';
import fs from 'fs';
import path from 'path';

describe('Safe Edits Generation', () => {
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

    test('should generate safe edits for Add to OSM', async () => {
        const feature = {
            properties: {
                ref: '123',
                website: 'https://new.com',
                'addr:country': 'DE',
                'addr:state': 'Berlin',
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

        await processSpiderResults(spiderData, spiderMatches, runs, safeEdits);

        expect(safeEdits['test-spider']).toBeDefined();
        expect(safeEdits['test-spider']['DE_berlin']).toBeDefined();
        const file = safeEdits['test-spider']['DE_berlin'];
        expect(file.metadata.country).toBe('Deutschland');
        expect(file.metadata.state).toBe('Berlin');
        expect(file.metadata.tags).toContain('website');
        expect(file.edits[0]).toEqual({
            type: 'node',
            id: '1',
            originalValues: { website: null },
            newValues: { website: 'https://new.com' }
        });
    });

    test('should handle countryless items', async () => {
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
                new Map(), new Map(),
                new Map([['123', { ref: '123', website: 'https://new.com' }]]),
                new Map([['123', { ref: '123', website: 'https://new.com' }]])
            ]
        };
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: { brand: 'Test', 'brand:wikidata': 'Q1' } }]]]);
        const safeEdits = {};

        await processSpiderResults(spiderData, spiderMatches, runs, safeEdits);

        expect(safeEdits['test-spider']['countryless']).toBeDefined();
        expect(safeEdits['test-spider']['countryless'].metadata.country).toBe('Countryless');
    });

    test('should group multiple tags for the same item', async () => {
        const feature = {
            properties: {
                ref: '123',
                website: 'https://new.com',
                phone: '+49 30 123456',
                'addr:country': 'DE',
                '@source_uri': 'https://example.com'
            }
        };
        const spiderData = {
            ...baseSpiderData,
            latestRun: { ...baseSpiderData.latestRun, features: [feature] },
            spiderMaps: [
                new Map(), new Map(),
                new Map([['123', { ref: '123', website: 'https://new.com', phone: '+49 30 123456' }]]),
                new Map([['123', { ref: '123', website: 'https://new.com', phone: '+49 30 123456' }]])
            ]
        };
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: { brand: 'Test', 'brand:wikidata': 'Q1' } }]]]);
        const safeEdits = {};

        await processSpiderResults(spiderData, spiderMatches, runs, safeEdits);

        const file = safeEdits['test-spider']['DE'];
        expect(file.edits[0].newValues).toHaveProperty('website');
        expect(file.edits[0].newValues).toHaveProperty('phone');
        expect(file.metadata.tags).toContain('website');
        expect(file.metadata.tags).toContain('phone');
    });
});
