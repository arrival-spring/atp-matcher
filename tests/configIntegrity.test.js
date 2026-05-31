import fs from 'fs';
import { getDomain } from 'tldts';

const CONFIG_FILE = 'config.json';

describe('Config Integrity Check', () => {
    let config;

    beforeAll(() => {
        const configContent = fs.readFileSync(CONFIG_FILE, 'utf8');
        config = JSON.parse(configContent);
    });

    test('config should have osmExtractUrl as a valid URL string', () => {
        expect(typeof config.osmExtractUrl).toBe('string');
        expect(() => new URL(config.osmExtractUrl)).not.toThrow();
    });

    test('config should have allowedImportableTags as an array of strings', () => {
        expect(Array.isArray(config.allowedImportableTags)).toBe(true);
        config.allowedImportableTags.forEach(tag => {
            expect(typeof tag).toBe('string');
        });
    });

    test('all spiders should have valid structure', () => {
        expect(Array.isArray(config.spiders)).toBe(true);

        config.spiders.forEach(spider => {
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
                // tldts returns null if it's not a valid domain.
                // However, some allowed entries might be just 'yum.com' which is valid.
                // If getDomain returns something, it's good.
                // If uri is 'localhost', getDomain might return null.
                // Let's use a simpler check or rely on getDomain for TLD-based domains.
                expect(domain).not.toBeNull();
            });
        });
    });

    test('spider names should be unique', () => {
        const names = config.spiders.map(s => s.name);
        const uniqueNames = new Set(names);
        expect(uniqueNames.size).toBe(names.length);
    });
});
