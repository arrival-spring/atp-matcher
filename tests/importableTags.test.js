
import { processSpiderResults } from '../src/sync.js';

describe('Importable Tags Logic', () => {
    const mockRuns = [
        { run_id: '2024-01-01-00-00' },
        { run_id: '2024-01-02-00-00' },
        { run_id: '2024-01-03-00-00' },
        { run_id: '2024-01-04-00-00' }
    ];

    const mockSpiderData = {
        latestRun: {
            features: [
                {
                    properties: {
                        ref: '1',
                        brand: 'Test Brand',
                        'brand:wikidata': 'Q1',
                        'fuel:diesel': 'yes',
                        'fuel:octane_95': 'yes',
                        'other_tag': 'value',
                        'email': 'test@example.com',
                        'website': 'http://example.com',
                        'opening_hours': 'Mo-Su 00:00-24:00'
                    }
                }
            ]
        },
        spiderMaps: [new Map(), new Map(), new Map(), new Map()],
        config: {
            name: 'test_spider',
            importableTags: ['fuel:*']
        },
        lineage: 'S_ATP_BRANDS',
        isBrandSpider: true
    };

    const mockSpiderMatches = new Map([
        ['1', []] // Unmapped
    ]);

    test('should expand wildcard tags', async () => {
        const { results, usedTags } = await processSpiderResults(mockSpiderData, mockSpiderMatches, mockRuns);

        expect(usedTags).toContain('fuel:diesel');
        expect(usedTags).toContain('fuel:octane_95');
        expect(usedTags).not.toContain('other_tag');

        const item = results[0];
        const tags = item.tags.map(t => t.tag);
        expect(tags).toContain('fuel:diesel');
        expect(tags).toContain('fuel:octane_95');
        expect(tags).toContain('website');
        expect(tags).toContain('opening_hours');
        expect(tags).not.toContain('email');
    });

    test('should only include email if explicitly in importableTags', async () => {
        const spiderDataWithEmail = {
            ...mockSpiderData,
            config: {
                ...mockSpiderData.config,
                importableTags: ['email']
            }
        };

        const { usedTags } = await processSpiderResults(spiderDataWithEmail, mockSpiderMatches, mockRuns);
        expect(usedTags).toContain('email');
        expect(usedTags).not.toContain('fuel:diesel');
    });

    test('should exclude email by default even if present in ATP', async () => {
        const spiderDataNoImportable = {
            ...mockSpiderData,
            config: {
                ...mockSpiderData.config,
                importableTags: []
            }
        };

        const { usedTags } = await processSpiderResults(spiderDataNoImportable, mockSpiderMatches, mockRuns);
        expect(usedTags).not.toContain('email');
        expect(usedTags).toContain('website');
        expect(usedTags).toContain('opening_hours');
    });
});
