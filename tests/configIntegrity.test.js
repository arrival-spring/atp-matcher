import fs from 'fs';

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
});
