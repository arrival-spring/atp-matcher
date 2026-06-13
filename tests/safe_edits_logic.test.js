import { processSpiderResults } from '../src/result_processor.js';

describe('processSpiderResults - check_date:opening_hours logic', () => {
    const runs = [
        { run_id: '2024-01-01T00:00:00Z' },
        { run_id: '2024-01-08T00:00:00Z' },
        { run_id: '2024-01-15T00:00:00Z' }, // History index 2: 2024-01-15
        { run_id: '2024-01-22T00:00:00Z' },
    ];

    const spiderData = {
        name: 'test-spider',
        latestRun: {
            features: [
                {
                    properties: {
                        ref: '123',
                        opening_hours: 'Mo-Su 09:00-18:00',
                        'addr:country': 'US',
                        '@source_uri': 'https://allowed.com/data',
                    },
                },
            ],
        },
        spiderMaps: [
            new Map([['123', { opening_hours: 'Mo-Su 10:00-20:00' }]]),
            new Map([['123', { opening_hours: 'Mo-Su 10:00-20:00' }]]),
            new Map([['123', { opening_hours: 'Mo-Su 09:00-18:00' }]]),
            new Map([['123', { opening_hours: 'Mo-Su 09:00-18:00' }]]),
        ],
        config: {
            name: 'test-spider',
            source_uri: ['allowed.com'],
            importableTags: ['opening_hours'],
        },
        isBrandSpider: true,
    };

    test('should add check_date:opening_hours for updateOsm when none exists', async () => {
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: { opening_hours: 'Mo-Su 10:00-20:00' } }]]]);
        const safeEdits = {};

        const { results } = await processSpiderResults(spiderData, spiderMatches, runs, safeEdits);

        expect(results[0].tags.find(t => t.tag === 'opening_hours').status).toBe('updateOsm');

        const edit = safeEdits['test-spider']['US'].edits[0];
        expect(edit.newValues.opening_hours).toBe('Mo-Su 09:00-18:00');
        expect(edit.newValues['check_date:opening_hours']).toBe('2024-01-15');
        expect(edit.originalValues['check_date:opening_hours']).toBeNull();
    });

    test('should update check_date:opening_hours when proposed date is newer', async () => {
        const spiderMatches = new Map([
            [
                '123',
                [
                    {
                        id: 'n1',
                        tags: {
                            opening_hours: 'Mo-Su 10:00-20:00',
                            'check_date:opening_hours': '2023-12-01',
                        },
                    },
                ],
            ],
        ]);
        const safeEdits = {};

        const { results } = await processSpiderResults(spiderData, spiderMatches, runs, safeEdits);

        expect(results[0].tags.find(t => t.tag === 'opening_hours').status).toBe('updateOsm');

        const edit = safeEdits['test-spider']['US'].edits[0];
        expect(edit.newValues['check_date:opening_hours']).toBe('2024-01-15');
        expect(edit.originalValues['check_date:opening_hours']).toBe('2023-12-01');
    });

    test('should NOT update opening_hours if proposed check_date is older or equal', async () => {
        const spiderMatches = new Map([
            [
                '123',
                [
                    {
                        id: 'n1',
                        tags: {
                            opening_hours: 'Mo-Su 10:00-20:00',
                            'check_date:opening_hours': '2024-01-22',
                        },
                    },
                ],
            ],
        ]);
        const safeEdits = {};

        const { results } = await processSpiderResults(spiderData, spiderMatches, runs, safeEdits);

        expect(results[0].tags.find(t => t.tag === 'opening_hours').status).toBe('mismatch');
        expect(safeEdits['test-spider']).toBeUndefined();
    });

    test('should NOT add check_date:opening_hours for addToOsm', async () => {
        const spiderMatches = new Map([['123', [{ id: 'n1', tags: {} }]]]);
        const safeEdits = {};

        const { results } = await processSpiderResults(spiderData, spiderMatches, runs, safeEdits);

        expect(results[0].tags.find(t => t.tag === 'opening_hours').status).toBe('addToOsm');

        const edit = safeEdits['test-spider']['US'].edits[0];
        expect(edit.newValues.opening_hours).toBe('Mo-Su 09:00-18:00');
        expect(edit.newValues['check_date:opening_hours']).toBeUndefined();
    });
});

describe('processSpiderResults - Threshold Logic', () => {
    const runs = [
        { run_id: '2024-01-01' },
        { run_id: '2024-01-08' },
        { run_id: '2024-01-15' },
        { run_id: '2024-01-22' },
    ];

    const generateSpiderData = count => {
        const features = [];
        const spiderMaps = [new Map(), new Map(), new Map(), new Map()];

        for (let i = 0; i < count; i++) {
            const ref = `ref${i}`;
            features.push({
                properties: {
                    ref,
                    website: 'https://new.com',
                    'addr:country': 'US',
                    '@source_uri': 'https://allowed.com/data',
                },
            });
            spiderMaps[0].set(ref, { website: 'https://old.com' });
            spiderMaps[1].set(ref, { website: 'https://old.com' });
            spiderMaps[2].set(ref, { website: 'https://new.com' });
            spiderMaps[3].set(ref, { website: 'https://new.com' });
        }

        return {
            name: 'threshold-spider',
            latestRun: { features },
            spiderMaps,
            config: {
                name: 'threshold-spider',
                source_uri: ['allowed.com'],
                importableTags: ['website'],
            },
            isBrandSpider: true,
        };
    };

    test('should skip edits if they exceed 5 items (for small datasets)', async () => {
        const count = 6;
        const data = generateSpiderData(count);
        const spiderMatches = new Map();
        for (let i = 0; i < count; i++) {
            spiderMatches.set(`ref${i}`, [{ id: `n${i}`, tags: { website: 'https://old.com' } }]);
        }
        const safeEdits = {};

        const { thresholdViolations } = await processSpiderResults(data, spiderMatches, runs, safeEdits);

        expect(thresholdViolations).toContainEqual(expect.objectContaining({ tag: 'website', count: 6 }));
        expect(safeEdits['threshold-spider']).toBeUndefined();
    });

    test('should skip edits if they exceed 10% (for larger datasets)', async () => {
        const count = 100;
        const editCount = 11;
        const data = generateSpiderData(count);
        const spiderMatches = new Map();

        // Make 11 items updateOsm
        for (let i = 0; i < count; i++) {
            const osmWebsite = i < editCount ? 'https://old.com' : 'https://new.com';
            spiderMatches.set(`ref${i}`, [{ id: `n${i}`, tags: { website: osmWebsite } }]);
        }
        const safeEdits = {};

        const { thresholdViolations } = await processSpiderResults(data, spiderMatches, runs, safeEdits);

        expect(thresholdViolations).toContainEqual(
            expect.objectContaining({ tag: 'website', count: 11, mappedCount: 100 })
        );
        expect(safeEdits['threshold-spider']).toBeUndefined();
    });

    test('should skip check_date:opening_hours if opening_hours is skipped', async () => {
        const count = 6;
        const data = generateSpiderData(count);
        // Change website to opening_hours in data
        data.config.importableTags = ['opening_hours'];
        data.latestRun.features.forEach(f => {
            f.properties.opening_hours = 'Mo-Su 09:00-18:00';
            delete f.properties.website;
        });
        data.spiderMaps.forEach((map, idx) => {
            for (const [_ref, props] of map) {
                props.opening_hours = idx < 2 ? 'Mo-Su 10:00-20:00' : 'Mo-Su 09:00-18:00';
                delete props.website;
            }
        });

        const spiderMatches = new Map();
        for (let i = 0; i < count; i++) {
            spiderMatches.set(`ref${i}`, [{ id: `n${i}`, tags: { opening_hours: 'Mo-Su 10:00-20:00' } }]);
        }
        const safeEdits = {};

        const { thresholdViolations } = await processSpiderResults(data, spiderMatches, runs, safeEdits);

        expect(thresholdViolations).toContainEqual(expect.objectContaining({ tag: 'opening_hours', count: 6 }));
        expect(safeEdits['threshold-spider']).toBeUndefined();
    });
});
