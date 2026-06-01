import { normalizeWebsite, areWebsitesEqual } from '../src/sync.js';

describe('Website Normalization and Matching', () => {
    test('normalizeWebsite should handle various URL formats', () => {
        expect(normalizeWebsite('http://example.com')).toBe('https://example.com');
        expect(normalizeWebsite('https://example.com')).toBe('https://example.com');
        expect(normalizeWebsite('example.com')).toBe('https://example.com');
        expect(normalizeWebsite('http://example.com/path')).toBe('https://example.com/path');
        expect(normalizeWebsite('HTTPS://EXAMPLE.COM/')).toBe('https://example.com');
    });

    test('areWebsitesEqual should match semantically equal URLs', () => {
        expect(areWebsitesEqual('http://example.com', 'https://example.com/')).toBe(true);
        expect(areWebsitesEqual('example.com', 'http://example.com')).toBe(true);
        expect(areWebsitesEqual('https://example.com/abc', 'https://example.com/abc/')).toBe(true);

        expect(normalizeWebsite('https://example.com/abc')).toBe('https://example.com/abc');
        expect(normalizeWebsite('https://example.com/abc/')).toBe('https://example.com/abc');
    });

    test('areWebsitesEqual should handle null/undefined', () => {
        expect(areWebsitesEqual(null, 'http://example.com')).toBe(false);
        expect(areWebsitesEqual('http://example.com', undefined)).toBe(false);
        expect(areWebsitesEqual(null, null)).toBe(true);
    });
});
