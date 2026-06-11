import fs from 'fs';
import path from 'path';

const localesDir = 'src/locales';
const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));
const localesMetadata = fs
    .readdirSync(localesDir)
    .filter(file => file.endsWith('.json'))
    .map(file => file.replace('.json', ''));

describe('i18n Integrity Tests', () => {
    const getAllKeys = (obj, prefix = '') => {
        let keys = [];
        for (const key in obj) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                keys = keys.concat(getAllKeys(obj[key], fullKey));
            } else {
                keys.push(fullKey);
            }
        }
        return keys;
    };

    const getPlaceholders = str => {
        if (typeof str !== 'string') return [];
        const matches = str.match(/{{\s*\w+\s*}}/g) || [];
        return matches.map(m => m.replace(/{{\s*|\s*}}/g, '')).sort();
    };

    const enKeys = getAllKeys(en);

    localesMetadata.forEach(locale => {
        if (locale === 'en') return;

        const localePath = path.join(localesDir, `${locale}.json`);
        if (!fs.existsSync(localePath)) {
            test(`${locale}.json should exist`, () => {
                throw new Error(`${locale}.json is missing but listed in locales.json`);
            });
            return;
        }

        const localeData = JSON.parse(fs.readFileSync(localePath, 'utf8'));
        const localeKeys = getAllKeys(localeData);

        // Sub-locales (e.g. en-GB) are allowed to have subset of keys
        const isSubLocale = locale.includes('-');

        if (!isSubLocale) {
            test(`${locale} should have all keys from en.json`, () => {
                enKeys.forEach(key => {
                    expect(localeKeys).toContain(key);
                });
            });
        }

        test(`${locale} should not have extra keys not present in en.json`, () => {
            localeKeys.forEach(key => {
                expect(enKeys).toContain(key);
            });
        });

        test(`${locale} should have matching placeholders`, () => {
            localeKeys.forEach(key => {
                const enValue = key.split('.').reduce((o, i) => o[i], en);
                const localeValue = key.split('.').reduce((o, i) => o[i], localeData);

                if (typeof enValue === 'string' && typeof localeValue === 'string') {
                    const enPlaceholders = getPlaceholders(enValue);
                    const localePlaceholders = getPlaceholders(localeValue);
                    expect(localePlaceholders).toEqual(enPlaceholders);
                }
            });
        });
    });

    test('en.json should have no empty values', () => {
        enKeys.forEach(key => {
            const value = key.split('.').reduce((o, i) => o[i], en);
            expect(value).not.toBe('');
        });
    });
});
