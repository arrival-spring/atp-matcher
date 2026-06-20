import { areAllDaysDefined, getMissingDays, formatMissingDays } from '../src/shared_utils.js';

describe('areAllDaysDefined', () => {
    test('standard formats with all days defined', () => {
        expect(areAllDaysDefined('Mo-Th 07:00-23:00; Fr-Sa 07:00-24:00; Su 07:00-23:00')).toBe(true);
        expect(areAllDaysDefined('Mo-Su 06:00-21:00')).toBe(true);
        expect(areAllDaysDefined('Mo-Fr 09:00-13:00; Sa-Su closed')).toBe(true);
        expect(areAllDaysDefined('Mo-Fr 09:00-15:30; Sa 09:00-11:00; Su closed')).toBe(true);
        expect(areAllDaysDefined('Mo-Th 07:00-23:00, Fr-Sa 07:00-24:00, Su 07:00-23:00')).toBe(true);
        expect(areAllDaysDefined('Mo-Sa 06:00-21:00 Su off')).toBe(true);
    });

    test('missing days', () => {
        expect(areAllDaysDefined('Sa 08:30-13:00; Su closed')).toBe(false);
        expect(areAllDaysDefined('Mo-Fr 09:00-15:30; Su closed')).toBe(false);
        expect(areAllDaysDefined('Mo-Th 09:00-17:00')).toBe(false);
    });

    test('24/7', () => {
        expect(areAllDaysDefined('24/7')).toBe(true);
    });

    test('wrapping ranges', () => {
        expect(areAllDaysDefined('Sa-Tu 08:00-20:00; We-Fr 08:00-20:00')).toBe(true);
    });

    test('comma separated days', () => {
        expect(areAllDaysDefined('Mo,Tu,We,Th,Fr,Sa,Su 09:00-18:00')).toBe(true);
    });

    test('unexpected words or characters', () => {
        expect(areAllDaysDefined('Mo-Fr 09:00-18:00; PH closed')).toBe(false);
        expect(areAllDaysDefined('Mo-Fr 09:00-18:00; Jan 1 closed')).toBe(false);
        expect(areAllDaysDefined('Mo-Su 09:00-18:00 (lunch 12:00-13:00)')).toBe(false);
    });

    test('empty or null', () => {
        expect(areAllDaysDefined('')).toBe(false);
        expect(areAllDaysDefined(null)).toBe(false);
    });
});

describe('getMissingDays and formatMissingDays', () => {
    test('standard formats with all days defined', () => {
        expect(getMissingDays('Mo-Th 07:00-23:00; Fr-Sa 07:00-24:00; Su 07:00-23:00')).toEqual([]);
        expect(getMissingDays('24/7')).toEqual([]);
    });

    test('missing days', () => {
        expect(getMissingDays('Sa 08:30-13:00; Su closed')).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr']);
        expect(formatMissingDays(getMissingDays('Sa 08:30-13:00; Su closed'))).toBe('Mo-Fr');

        expect(getMissingDays('Mo-Fr 09:00-15:30; Su closed')).toEqual(['Sa']);
        expect(formatMissingDays(getMissingDays('Mo-Fr 09:00-15:30; Su closed'))).toBe('Sa');

        expect(getMissingDays('Mo-Th 09:00-17:00')).toEqual(['Fr', 'Sa', 'Su']);
        expect(formatMissingDays(getMissingDays('Mo-Th 09:00-17:00'))).toBe('Fr-Su');
    });

    test('non-consecutive missing days', () => {
        expect(getMissingDays('Mo 09:00-17:00; We 09:00-17:00; Fr 09:00-17:00')).toEqual(['Tu', 'Th', 'Sa', 'Su']);
        expect(formatMissingDays(getMissingDays('Mo 09:00-17:00; We 09:00-17:00; Fr 09:00-17:00'))).toBe(
            'Tu, Th, Sa-Su'
        );
    });

    test('unexpected words return null', () => {
        expect(getMissingDays('Mo-Su 09:00-18:00 (lunch 12:00-13:00)')).toBeNull();
        expect(formatMissingDays(getMissingDays('Mo-Su 09:00-18:00 (lunch 12:00-13:00)'))).toBe('');
    });

    test('empty or null input', () => {
        expect(getMissingDays('')).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
        expect(formatMissingDays(getMissingDays(''))).toBe('Mo-Su');
        expect(getMissingDays(null)).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
    });
});
