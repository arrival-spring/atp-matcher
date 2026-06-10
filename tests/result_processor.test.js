import { processSpiderResults } from '../src/result_processor.js';

describe('processSpiderResults Status Logic', () => {
    const runs = [
        { run_id: '2024-01-01T00:00:00Z' },
        { run_id: '2024-01-02T00:00:00Z' },
        { run_id: '2024-01-03T00:00:00Z' },
        { run_id: '2024-01-04T00:00:00Z' },
    ];

    const spiderData = {
        name: 'test-spider',
        latestRun: {
            features: [
                {
                    properties: {
                        ref: '123',
                        website: 'https://new.com',
                        'addr:country': 'US',
                        'addr:state': 'California',
                        '@source_uri': 'https://allowed.com/data',
                    },
                },
            ],
        },
        spiderMaps: [
            new Map([['123', { website: 'https://old.com' }]]),
            new Map([['123', { website: 'https://old.com' }]]),
            new Map([['123', { website: 'https://new.com' }]]),
            new Map([['123', { website: 'https://new.com' }]]),
        ],
        config: {
            name: 'test-spider',
            source_uri: ['allowed.com'],
            importableTags: ['website'],
        },
        isBrandSpider: true,
        lineage: 'S_ATP_BRANDS',
    };

    test('should identify "updateOsm" when stable and mismatching', async () => {
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: { website: 'https://old.com' } }]]]);

        const { results } = await processSpiderResults(spiderData, spiderMatches, runs);
        const websiteTag = results[0].tags.find(t => t.tag === 'website');
        expect(websiteTag.status).toBe('updateOsm');
    });

    test('should identify "mismatch" when unstable', async () => {
        const unstableSpiderData = {
            ...spiderData,
            spiderMaps: [
                new Map([['123', { website: 'https://old.com' }]]),
                new Map([['123', { website: 'https://other.com' }]]), // changed here
                new Map([['123', { website: 'https://new.com' }]]),
                new Map([['123', { website: 'https://new.com' }]]),
            ],
        };
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: { website: 'https://old.com' } }]]]);

        const { results } = await processSpiderResults(unstableSpiderData, spiderMatches, runs);
        const websiteTag = results[0].tags.find(t => t.tag === 'website');
        expect(websiteTag.status).toBe('mismatch');
    });

    test('should identify "addToOsm" when OSM value is missing even if ATP is NOT stable', async () => {
        const unstableSpiderData = {
            ...spiderData,
            spiderMaps: [
                new Map([['123', { website: 'https://old.com' }]]),
                new Map([['123', { website: 'https://other.com' }]]),
                new Map([['123', { website: 'https://other.com' }]]),
                new Map([['123', { website: 'https://new.com' }]]), // only latest
            ],
        };
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: {} }]]]);

        const { results } = await processSpiderResults(unstableSpiderData, spiderMatches, runs);
        const websiteTag = results[0].tags.find(t => t.tag === 'website');
        expect(websiteTag.status).toBe('addToOsm');
        expect(websiteTag.isStable).toBe(false);
    });

    test('should identify "editMade" when in auto and included in safe edits', async () => {
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: { website: 'https://old.com' } }]]]);
        const safeEdits = {};

        const { results } = await processSpiderResults(spiderData, spiderMatches, runs, safeEdits, true);
        const websiteTag = results[0].tags.find(t => t.tag === 'website');
        expect(websiteTag.status).toBe('editMade');
        expect(results[0].status).toBe('editMade');
    });

    test('should validate opening_hours days before updateOsm', async () => {
        const ohSpiderData = {
            ...spiderData,
            latestRun: {
                features: [
                    {
                        properties: {
                            ref: '123',
                            opening_hours: 'Sa 09:00-12:00', // Missing days
                            'addr:country': 'US',
                            '@source_uri': 'https://allowed.com/data',
                        },
                    },
                ],
            },
            spiderMaps: Array(4).fill(new Map([['123', { opening_hours: 'Sa 09:00-12:00' }]])),
            config: { ...spiderData.config, importableTags: ['opening_hours'] },
        };
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: { opening_hours: 'Mo-Su 09:00-18:00' } }]]]);

        const { results } = await processSpiderResults(ohSpiderData, spiderMatches, runs);
        const ohTag = results[0].tags.find(t => t.tag === 'opening_hours');
        expect(ohTag.status).toBe('mismatch');
    });

    test('should NOT identify "editMade" when threshold is exceeded', async () => {
        // Create a spider with many features to trigger threshold (10% of mapped)
        const manyFeatures = [];
        const spiderMaps = [new Map(), new Map(), new Map(), new Map()];
        const spiderMatches = new Map();

        for (let i = 0; i < 100; i++) {
            const ref = i.toString();
            manyFeatures.push({
                properties: {
                    ref,
                    website: 'https://new.com',
                    '@source_uri': 'https://allowed.com/data',
                    'addr:country': 'US',
                },
            });
            spiderMaps[0].set(ref, { website: 'https://old.com' });
            spiderMaps[1].set(ref, { website: 'https://old.com' });
            spiderMaps[2].set(ref, { website: 'https://new.com' });
            spiderMaps[3].set(ref, { website: 'https://new.com' });
            spiderMatches.set(ref, [{ id: `n${i}`, tags: { website: 'https://old.com' } }]);
        }

        const largeSpiderData = {
            name: 'large-spider',
            latestRun: { features: manyFeatures },
            spiderMaps,
            config: {
                name: 'large-spider',
                source_uri: ['allowed.com'],
                importableTags: ['website'],
            },
            isBrandSpider: true,
            lineage: 'S_ATP_BRANDS',
        };

        // If we have 100 mapped items, and 100 updates, that's 100% which is > 10% threshold.
        const safeEdits = {};
        const { results, thresholdViolations } = await processSpiderResults(largeSpiderData, spiderMatches, runs, safeEdits, true);

        expect(thresholdViolations.length).toBeGreaterThan(0);
        const websiteTag = results[0].tags.find(t => t.tag === 'website');
        // It should remain updateOsm, NOT editMade
        expect(websiteTag.status).toBe('updateOsm');
    });

    test('should identify "matching" when values are equal', async () => {
        const matchingSpiderData = {
            ...spiderData,
            latestRun: {
                features: [
                    {
                        properties: {
                            ref: '123',
                            website: 'https://old.com',
                            'addr:country': 'US',
                            'addr:state': 'California',
                            '@source_uri': 'https://allowed.com/data',
                        },
                    },
                ],
            },
            spiderMaps: Array(4).fill(new Map([['123', { website: 'https://old.com' }]])),
            config: {
                ...spiderData.config,
                source_uri: ['allowed.com'],
            },
            lineage: 'S_ATP_BRANDS',
            isBrandSpider: true,
        };
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: { website: 'https://old.com' } }]]]);

        const { results } = await processSpiderResults(matchingSpiderData, spiderMatches, runs);
        const websiteTag = results[0].tags.find(t => t.tag === 'website');
        expect(websiteTag.status).toBe('matching');
    });

    test('should handle "disallowedSourceUri"', async () => {
        const disallowedData = {
            ...spiderData,
            latestRun: {
                features: [
                    {
                        properties: {
                            ref: '123',
                            website: 'https://new.com',
                            'addr:country': 'US',
                            'addr:state': 'California',
                            '@source_uri': 'https://evil.com/data',
                        },
                    },
                ],
            },
        };
        const spiderMatches = new Map();

        const { results } = await processSpiderResults(disallowedData, spiderMatches, runs);
        expect(results[0].status).toBe('disallowedSourceUri');
    });

    test('should handle "notABrandSpider"', async () => {
        const notBrandData = {
            ...spiderData,
            isBrandSpider: false,
        };
        const spiderMatches = new Map();

        const { results } = await processSpiderResults(notBrandData, spiderMatches, runs);
        expect(results[0].status).toBe('notABrandSpider');
    });
});

describe('processSpiderResults Safe Edits', () => {
    const runs = [
        { run_id: '2024-01-01T00:00:00Z' },
        { run_id: '2024-01-02T00:00:00Z' },
        { run_id: '2024-01-03T00:00:00Z' },
        { run_id: '2024-01-04T00:00:00Z' },
    ];

    const spiderData = {
        name: 'test-spider',
        latestRun: {
            features: [
                {
                    properties: {
                        ref: '123',
                        website: 'https://new.com',
                        'addr:country': 'US',
                        'addr:state': 'California',
                        '@source_uri': 'https://allowed.com/data',
                    },
                },
            ],
        },
        spiderMaps: [
            new Map([['123', { website: 'https://old.com' }]]),
            new Map([['123', { website: 'https://old.com' }]]),
            new Map([['123', { website: 'https://new.com' }]]),
            new Map([['123', { website: 'https://new.com' }]]),
        ],
        config: {
            name: 'test-spider',
            source_uri: ['allowed.com'],
            importableTags: ['website'],
        },
        isBrandSpider: true,
        lineage: 'S_ATP_BRANDS',
    };

    test('should generate safe edits for "updateOsm"', async () => {
        const spiderMatches = new Map([['123', [{ id: 'n12345', tags: { website: 'https://old.com' } }]]]);
        const safeEdits = {};

        await processSpiderResults(spiderData, spiderMatches, runs, safeEdits);

        expect(safeEdits['test-spider']).toBeDefined();
        expect(safeEdits['test-spider']['US_california']).toBeDefined();
        const edit = safeEdits['test-spider']['US_california'].edits[0];
        expect(edit.type).toBe('node');
        expect(edit.id).toBe('12345');
        expect(edit.originalValues.website).toBe('https://old.com');
        expect(edit.newValues.website).toBe('https://new.com');
    });

    test('should handle countryless edits', async () => {
        const countrylessData = {
            ...spiderData,
            latestRun: {
                features: [
                    {
                        properties: {
                            ref: '123',
                            website: 'https://new.com',
                            '@source_uri': 'https://allowed.com/data',
                        },
                    },
                ],
            },
            config: {
                ...spiderData.config,
                source_uri: ['allowed.com'],
            },
            lineage: 'S_ATP_BRANDS',
            isBrandSpider: true,
        };
        const spiderMatches = new Map([['123', [{ id: 'w987', tags: { website: 'https://old.com' } }]]]);
        const safeEdits = {};

        await processSpiderResults(countrylessData, spiderMatches, runs, safeEdits);

        expect(safeEdits['test-spider']['countryless']).toBeDefined();
        const edit = safeEdits['test-spider']['countryless'].edits[0];
        expect(edit.type).toBe('way');
        expect(edit.id).toBe('987');
    });

    test('should include metadata in safe edits', async () => {
        const spiderMatches = new Map([['123', [{ id: 'r1', tags: { website: 'https://old.com' } }]]]);
        const safeEdits = {};

        await processSpiderResults(spiderData, spiderMatches, runs, safeEdits);

        const metadata = safeEdits['test-spider']['US_california'].metadata;
        expect(metadata.spider).toBe('test-spider');
        expect(metadata.countryCode).toBe('US');
        expect(metadata.state).toBe('California');
        expect(metadata.tags).toContain('website');
    });

    test('should include check_date:* in safe edits if already on OSM', async () => {
        const spiderMatches = new Map([
            [
                '123',
                [
                    {
                        id: 'n1',
                        tags: {
                            website: 'https://old.com',
                            'check_date:website': '2023-01-01',
                        },
                    },
                ],
            ],
        ]);
        const safeEdits = {};

        await processSpiderResults(spiderData, spiderMatches, runs, safeEdits);

        const edit = safeEdits['test-spider']['US_california'].edits[0];
        expect(edit.newValues.website).toBe('https://new.com');
        expect(edit.newValues['check_date:website']).toBe('2024-01-03'); // history[2].date
    });

    test('should NOT include check_date:* if NOT on OSM (except for opening_hours)', async () => {
        const spiderMatches = new Map([
            [
                '123',
                [
                    {
                        id: 'n1',
                        tags: {
                            website: 'https://old.com',
                        },
                    },
                ],
            ],
        ]);
        const safeEdits = {};

        await processSpiderResults(spiderData, spiderMatches, runs, safeEdits);

        const edit = safeEdits['test-spider']['US_california'].edits[0];
        expect(edit.newValues.website).toBe('https://new.com');
        expect(edit.newValues['check_date:website']).toBeUndefined();
    });

    test('should identify mismatch if existing check_date is newer', async () => {
        const spiderMatches = new Map([
            [
                '123',
                [
                    {
                        id: 'n1',
                        tags: {
                            website: 'https://old.com',
                            'check_date:website': '2024-05-01', // newer than 2024-01-03
                        },
                    },
                ],
            ],
        ]);

        const { results } = await processSpiderResults(spiderData, spiderMatches, runs);
        const websiteTag = results[0].tags.find(t => t.tag === 'website');
        expect(websiteTag.status).toBe('mismatch');
    });

    test('should separate threshold for adds and updates', async () => {
        const manyFeatures = [];
        const spiderMaps = [new Map(), new Map(), new Map(), new Map()];
        const spiderMatches = new Map();

        // 11 updates (will exceed 10% of 100)
        for (let i = 0; i < 11; i++) {
            const ref = i.toString();
            manyFeatures.push({
                properties: { ref, website: 'https://new.com', '@source_uri': 'https://allowed.com/data', 'addr:country': 'US' },
            });
            spiderMaps[0].set(ref, { website: 'https://old.com' });
            spiderMaps[1].set(ref, { website: 'https://old.com' });
            spiderMaps[2].set(ref, { website: 'https://new.com' });
            spiderMaps[3].set(ref, { website: 'https://new.com' });
            spiderMatches.set(ref, [{ id: `n${i}`, tags: { website: 'https://old.com' } }]);
        }

        // 2 adds (will NOT exceed 10% of 100)
        for (let i = 11; i < 13; i++) {
            const ref = i.toString();
            manyFeatures.push({
                properties: { ref, website: 'https://new.com', '@source_uri': 'https://allowed.com/data', 'addr:country': 'US' },
            });
            spiderMaps[0].set(ref, { website: 'https://new.com' });
            spiderMaps[1].set(ref, { website: 'https://new.com' });
            spiderMaps[2].set(ref, { website: 'https://new.com' });
            spiderMaps[3].set(ref, { website: 'https://new.com' });
            spiderMatches.set(ref, [{ id: `n${i}`, tags: {} }]);
        }

        // Add more matching features to reach 100 mapped items
        for (let i = 13; i < 100; i++) {
            const ref = i.toString();
            manyFeatures.push({
                properties: { ref, website: 'https://ok.com', '@source_uri': 'https://allowed.com/data', 'addr:country': 'US' },
            });
            spiderMaps.forEach(m => m.set(ref, { website: 'https://ok.com' }));
            spiderMatches.set(ref, [{ id: `n${i}`, tags: { website: 'https://ok.com' } }]);
        }

        const largeSpiderData = {
            name: 'large-spider',
            latestRun: { features: manyFeatures },
            spiderMaps,
            config: { name: 'large-spider', source_uri: ['allowed.com'], importableTags: ['website'] },
            isBrandSpider: true,
            lineage: 'S_ATP_BRANDS',
        };

        const safeEdits = {};
        const { results, thresholdViolations } = await processSpiderResults(largeSpiderData, spiderMatches, runs, safeEdits, true);

        // Updates should be blocked, adds should be allowed
        expect(thresholdViolations).toContainEqual(expect.objectContaining({ type: 'update', tag: 'website' }));
        expect(thresholdViolations).not.toContainEqual(expect.objectContaining({ type: 'add', tag: 'website' }));

        const updateTag = results.find(r => r.ref === '0').tags.find(t => t.tag === 'website');
        const addTag = results.find(r => r.ref === '11').tags.find(t => t.tag === 'website');

        expect(updateTag.status).toBe('updateOsm');
        expect(addTag.status).toBe('editMade');
    });
});

describe('Importable Tags Logic', () => {
    const mockRuns = [
        { run_id: '2024-01-01' },
        { run_id: '2024-01-02' },
        { run_id: '2024-01-03' },
        { run_id: '2024-01-04' },
    ];

    const mockSpiderData = {
        name: 'test_spider',
        config: {
            name: 'test_spider',
            importableTags: ['brand', 'fuel:*'],
            source_uri: ['example.com'],
        },
        latestRun: {
            features: [
                {
                    properties: {
                        ref: '1',
                        brand: 'Test Brand',
                        'fuel:octane_95': 'yes',
                        'fuel:diesel': 'no',
                        other_tag: 'ignore me',
                        '@source_uri': 'http://example.com',
                    },
                },
            ],
        },
        spiderMaps: [
            new Map([['1', { brand: 'Test Brand', 'fuel:octane_95': 'yes', 'fuel:diesel': 'no' }]]),
            new Map([['1', { brand: 'Test Brand', 'fuel:octane_95': 'yes', 'fuel:diesel': 'no' }]]),
            new Map([['1', { brand: 'Test Brand', 'fuel:octane_95': 'yes', 'fuel:diesel': 'no' }]]),
            new Map([['1', { brand: 'Test Brand', 'fuel:octane_95': 'yes', 'fuel:diesel': 'no' }]]),
        ],
        isBrandSpider: true,
    };

    test('should expand wildcard tags', async () => {
        const spiderMatches = new Map();
        const { usedTags } = await processSpiderResults(mockSpiderData, spiderMatches, mockRuns);

        expect(usedTags).toContain('brand');
        expect(usedTags).toContain('fuel:octane_95');
        expect(usedTags).toContain('fuel:diesel');
        expect(usedTags).not.toContain('other_tag');
        expect(usedTags).not.toContain('fuel:*');
    });

    test('should include opening_hours and website even if not in importableTags', async () => {
        const dataWithExtra = {
            ...mockSpiderData,
            latestRun: {
                features: [
                    {
                        properties: {
                            ref: '1',
                            opening_hours: '24/7',
                            website: 'http://example.com',
                            '@source_uri': 'http://example.com',
                        },
                    },
                ],
            },
        };
        const spiderMatches = new Map();
        const { usedTags } = await processSpiderResults(dataWithExtra, spiderMatches, mockRuns);

        expect(usedTags).toContain('opening_hours');
        expect(usedTags).toContain('website');
    });
});
