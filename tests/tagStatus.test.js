import { areOpeningHoursEqual, arePhonesEqual, areWebsitesEqual, areTagsEqual, getOverallStatus } from '../src/sync.js';

describe('Tag Comparison Logic', () => {
    describe('areOpeningHoursEqual', () => {
        test('should return true for identical strings', () => {
            expect(areOpeningHoursEqual('Mo-Fr 08:00-17:00', 'Mo-Fr 08:00-17:00')).toBe(true);
        });

        test('should return true for semantically equivalent strings', () => {
            expect(areOpeningHoursEqual('Mo-Fr 08:00-17:00; Sa 08:00-12:00', 'Mo-Fr 08:00-17:00; Sa 08:00-12:00')).toBe(
                true
            );
            // opening_hours library should handle normalization
            expect(areOpeningHoursEqual('Mo-Fr 08:00-17:00', 'Mo,Tu,We,Th,Fr 08:00-17:00')).toBe(true);
        });

        test('should return true if both are invalid', () => {
            expect(areOpeningHoursEqual('invalid', 'garbage')).toBe(true);
        });

        test('should return false if one is valid and other is invalid/different', () => {
            expect(areOpeningHoursEqual('Mo-Fr 08:00-17:00', 'Mo-Fr 08:00-18:00')).toBe(false);
            expect(areOpeningHoursEqual('Mo-Fr 08:00-17:00', 'invalid')).toBe(false);
        });

        test('should handle Public Holidays (PH) in OSM but not ATP', () => {
            // Case 1: PH off combined with other day
            expect(areOpeningHoursEqual('Mo-Fr 08:00-17:00; Sa 08:00-13:00; Su,PH off', 'Mo-Fr 08:00-17:00; Sa 08:00-13:00')).toBe(true);

            // Case 2: PH at start
            expect(areOpeningHoursEqual('PH,Mo-Su 00:00-24:00', 'Mo-Su 00:00-24:00')).toBe(true);

            // Case 3: PH as a dedicated rule at the end
            expect(areOpeningHoursEqual('Mo-Fr 08:00-18:00; Sa-Su 08:00-13:00; PH 09:00-12:00', 'Mo-Fr 08:00-18:00; Sa-Su 08:00-13:00')).toBe(true);

            // Case 4: PH off as a separate rule
            expect(areOpeningHoursEqual('Mo-Fr 08:00-17:00; PH off', 'Mo-Fr 08:00-17:00')).toBe(true);

            // Verify that explicit 'off' in OSM matches implicit 'off' in ATP
            expect(areOpeningHoursEqual('Mo-Fr 09:00-17:00; Sa,Su off', 'Mo-Fr 09:00-17:00')).toBe(true);
        });

        test('should not apply PH transformations if ATP also contains PH', () => {
            // If both have PH, they must match semantically as they are
            expect(areOpeningHoursEqual('Mo-Fr 08:00-17:00; PH 08:00-12:00', 'Mo-Fr 08:00-17:00; PH 09:00-13:00', 'de')).toBe(false);
            expect(areOpeningHoursEqual('Mo-Fr 08:00-17:00; PH 08:00-12:00', 'Mo-Fr 08:00-17:00; PH 08:00-12:00', 'de')).toBe(true);
        });
    });

    describe('arePhonesEqual', () => {
        test('should return true for identical E.164 numbers', () => {
            expect(arePhonesEqual('+27111234567', '+27111234567', 'ZA')).toBe(true);
        });

        test('should return true for same number in different formats', () => {
            expect(arePhonesEqual('011 123 4567', '+27 11 123 4567', 'ZA')).toBe(true);
        });

        test('should return false for different numbers', () => {
            expect(arePhonesEqual('+27111234567', '+27117654321', 'ZA')).toBe(false);
        });

        test('should return true if ATP value is invalid (discarded)', () => {
            expect(arePhonesEqual('+27111234567', 'invalid', 'ZA')).toBe(true); // invalid ATP is discarded, returns true
        });

        test('should return true if both are identical even if invalid', () => {
            expect(arePhonesEqual('invalid', 'invalid', 'ZA')).toBe(true);
        });

        test('should handle multiple values with semicolon', () => {
            expect(arePhonesEqual('+27111234567; +27117654321', '+27111234567', 'ZA')).toBe(true);
            expect(arePhonesEqual('+27111234567', '+27111234567; +27117654321', 'ZA')).toBe(false);
            expect(arePhonesEqual('+27111234567; +27117654321', '+27117654321; +27111234567', 'ZA')).toBe(true);
            expect(arePhonesEqual('+27111234567; +27117654321; +27110000000', '+27111234567; +27117654321', 'ZA')).toBe(
                true
            );
        });

        test('should ignore invalid OSM values in semicolon list', () => {
            expect(arePhonesEqual('+27111234567; invalid', '+27111234567', 'ZA')).toBe(true);
        });

        test('should discard invalid ATP values in semicolon list', () => {
            expect(arePhonesEqual('+27111234567', '+27111234567; invalid', 'ZA')).toBe(true);
        });
    });

    describe('areWebsitesEqual', () => {
        test('should return true for identical URLs', () => {
            expect(areWebsitesEqual('https://example.com', 'https://example.com')).toBe(true);
        });

        test('should return true for semantically equivalent URLs', () => {
            expect(areWebsitesEqual('http://example.com/', 'https://example.com')).toBe(true);
            expect(areWebsitesEqual('https://www.example.com', 'https://example.com')).toBe(true);
        });

        test('should return false for different domains', () => {
            expect(areWebsitesEqual('https://example.com', 'https://other.com')).toBe(false);
        });
    });

    describe('areTagsEqual', () => {
        test('should route to correct comparison function', () => {
            expect(areTagsEqual('phone', '011 123 4567', '+27111234567', 'ZA')).toBe(true);
            expect(areTagsEqual('website', 'http://example.com', 'https://example.com', 'ZA')).toBe(true);
            expect(areTagsEqual('opening_hours', 'Mo-Fr 08:00-17:00', 'Mo,Tu,We,Th,Fr 08:00-17:00', 'ZA')).toBe(true);
        });

        test('should use strict equality for unknown tags', () => {
            expect(areTagsEqual('brand', 'KFC', 'kfc', 'ZA')).toBe(false);
            expect(areTagsEqual('brand', 'KFC', 'KFC', 'ZA')).toBe(true);
        });
    });

    describe('getOverallStatus', () => {
        test('should return highest priority status', () => {
            expect(getOverallStatus(['matching', 'mismatch', 'no OSM tag'])).toBe('mismatch');
            expect(getOverallStatus(['matching', 'update OSM', 'not mapped'])).toBe('update OSM');
            expect(getOverallStatus(['disallowed source uri', 'mismatch'])).toBe('disallowed source uri');
            expect(getOverallStatus(['not a brand spider', 'disallowed source uri'])).toBe('not a brand spider');
        });

        test('should return matching if all are matching', () => {
            expect(getOverallStatus(['matching', 'matching'])).toBe('matching');
        });

        test('should return matching for empty list', () => {
            expect(getOverallStatus([])).toBe('matching');
        });
    });
});
