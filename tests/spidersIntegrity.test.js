import fs from 'fs';
import { getDomain } from 'tldts';

const CONFIG_FILE = 'config.json';
const SPIDERS_AUTO_FILE = 'spiders_auto.json';
const SPIDERS_PREVIEW_FILE = 'spiders_preview.json';

describe('Spiders Integrity Check', () => {
    let config;
    let spiders;

    let spidersAuto, spidersPreview;

    beforeAll(() => {
        const configContent = fs.readFileSync(CONFIG_FILE, 'utf8');
        config = JSON.parse(configContent);
        const autoContent = fs.readFileSync(SPIDERS_AUTO_FILE, 'utf8');
        const previewContent = fs.readFileSync(SPIDERS_PREVIEW_FILE, 'utf8');
        spidersAuto = JSON.parse(autoContent);
        spidersPreview = JSON.parse(previewContent);
        spiders = { ...spidersAuto, ...spidersPreview };
    });

    test('all spiders should have valid structure', () => {
        expect(typeof spiders).toBe('object');

        Object.entries(spiders).forEach(([spiderName, spider]) => {
            // Check name
            expect(typeof spiderName).toBe('string');
            expect(spiderName.length).toBeGreaterThan(0);

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
        const namesAuto = Object.keys(spidersAuto);
        const namesPreview = Object.keys(spidersPreview);
        const allNames = [...namesAuto, ...namesPreview];
        const uniqueNames = new Set(allNames);
        expect(uniqueNames.size).toBe(allNames.length);
    });

    test('rejected property should only be in preview spiders', () => {
        Object.values(spidersAuto).forEach(spider => {
            expect(spider.rejected).toBeUndefined();
        });

        Object.values(spidersPreview).forEach(spider => {
            if (spider.rejected) {
                expect(typeof spider.rejected).toBe('string');
                expect(spider.rejected.length).toBeGreaterThan(0);
            }
        });
    });
});
