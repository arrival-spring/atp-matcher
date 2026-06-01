import fs from 'fs';
import { getDomain } from 'tldts';

const CONFIG_FILE = 'config.json';
const SPIDERS_FILE = 'spiders.json';

describe('Spiders Integrity Check', () => {
    let config;
    let spiders;

    beforeAll(() => {
        const configContent = fs.readFileSync(CONFIG_FILE, 'utf8');
        config = JSON.parse(configContent);
        const spidersContent = fs.readFileSync(SPIDERS_FILE, 'utf8');
        spiders = JSON.parse(spidersContent);
    });

    test('all spiders should have valid structure', () => {
        expect(Array.isArray(spiders)).toBe(true);

        spiders.forEach(spider => {
            // Check name
            expect(typeof spider.name).toBe('string');
            expect(spider.name.length).toBeGreaterThan(0);

            // Check matchingKey
            expect(typeof spider.matchingKey).toBe('string');
            const isValidMatchingKey =
                spider.matchingKey === 'website' ||
                spider.matchingKey === 'ref' ||
                spider.matchingKey.startsWith('ref:');
            expect(isValidMatchingKey).toBe(true);

            // Check importableTags
            expect(Array.isArray(spider.importableTags)).toBe(true);
            spider.importableTags.forEach(tag => {
                expect(config.allowedImportableTags).toContain(tag);
            });

            // Check source_uri
            expect(Array.isArray(spider.source_uri)).toBe(true);
            expect(spider.source_uri.length).toBeGreaterThan(0);
            spider.source_uri.forEach(uri => {
                expect(typeof uri).toBe('string');
                // Check if it's a valid domain/hostname
                const domain = getDomain(uri);
                expect(domain).not.toBeNull();
            });
        });
    });

    test('spider names should be unique', () => {
        const names = spiders.map(s => s.name);
        const uniqueNames = new Set(names);
        expect(uniqueNames.size).toBe(names.length);
    });

    test('website cannot be both an importable tag and the matching key', () => {
        spiders.forEach(spider => {
            if (spider.matchingKey === 'website') {
                expect(spider.importableTags).not.toContain('website');
            }
        });
    });

    test('spiders and their arrays should be sorted alphabetically', () => {
        const sortedSpiders = spiders
            .map(s => ({
                ...s,
                importableTags: [...s.importableTags].sort(),
                source_uri: [...s.source_uri].sort(),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        expect(spiders).toEqual(sortedSpiders);
    });
});
