import { parseOplTags } from '../src/osm_stream.js';

describe('OSM Stream Logic', () => {
    test('parseOplTags should decode OPL tags correctly', () => {
        // OPL uses %HEX% for encoding. Space is %20%.
        // Re-reading code: return str.replace(/%([0-9A-Fa-f]{1,6})%/g, (match, hex) => {
        // So yes, it needs %HEX% format.
        const parsed = parseOplTags('Tbrand=KFC,name=KFC%20%London');
        expect(parsed.brand).toBe('KFC');
        expect(parsed.name).toBe('KFC London');
    });

    test('parseOplTags should handle empty tags', () => {
        expect(parseOplTags('')).toEqual({});
        expect(parseOplTags('T')).toEqual({});
    });
});
