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

            // Check ref_key
            if (spider.ref_key) {
                expect(typeof spider.ref_key).toBe('string');
                expect(spider.ref_key.startsWith('ref:') || spider.ref_key === 'branch').toBe(true);
            }

            // Check importableTags
            if (spider.importableTags) {
                expect(Array.isArray(spider.importableTags)).toBe(true);
                spider.importableTags.forEach(tag => {
                    if (tag.endsWith(':*')) {
                        const prefix = tag.slice(0, -1);
                        const hasAllowedMatch = config.allowedImportableTags.some(allowed =>
                            allowed.startsWith(prefix)
                        );
                        expect(hasAllowedMatch).toBe(true);
                    } else {
                        expect(config.allowedImportableTags).toContain(tag);
                    }
                });
            }

            // Check source_uri
            expect(Array.isArray(spider.source_uri)).toBe(true);
            expect(spider.source_uri.length).toBeGreaterThan(0);
            spider.source_uri.forEach(uri => {
                expect(typeof uri).toBe('string');
                // Check if it's a valid domain/hostname
                const domain = getDomain(uri);
                expect(domain).not.toBeNull();
            });

            // Check categories
            if (spider.categories) {
                expect(Array.isArray(spider.categories)).toBe(true);
                spider.categories.forEach(cat => {
                    expect(typeof cat).toBe('object');
                    expect(cat).not.toBeNull();
                    expect(Array.isArray(cat)).toBe(false);
                    expect(Object.keys(cat).length).toBe(1);
                });
            }
        });
    });

    test('spider names should be unique', () => {
        const names = spiders.map(s => s.name);
        const uniqueNames = new Set(names);
        expect(uniqueNames.size).toBe(names.length);
    });
});
