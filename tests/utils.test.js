import { calculateStability } from '../src/shared_utils.js';

describe('calculateStability', () => {
    test('non-brand spider should be red with 0 score', () => {
        const result = calculateStability([100, 100, 100, 100], false);
        expect(result.stabilityColour).toBe('red');
        expect(result.stabilityScore).toBe(0.0);
    });

    test('single run should be grey with 0 score', () => {
        const result = calculateStability([null, null, null, 100], true);
        expect(result.stabilityColour).toBe('grey');
        expect(result.stabilityScore).toBe(0.0);
    });

    test('perfect stability should be green with 1.0 score', () => {
        const result = calculateStability([100, 100, 100, 100], true);
        expect(result.stabilityColour).toBe('green');
        expect(result.stabilityScore).toBe(1.0);
    });

    test('small discrepancy (3%) should be green', () => {
        const result = calculateStability([100, 97], true);
        expect(result.stabilityColour).toBe('green');
        expect(result.stabilityScore).toBeCloseTo(0.97);
    });

    test('medium discrepancy (7%) should be orange', () => {
        const result = calculateStability([100, 93], true);
        expect(result.stabilityColour).toBe('orange');
        expect(result.stabilityScore).toBeCloseTo(0.93);
    });

    test('large discrepancy (15%) should be red', () => {
        const result = calculateStability([100, 85], true);
        expect(result.stabilityColour).toBe('red');
        expect(result.stabilityScore).toBeCloseTo(0.85);
    });

    test('zero feature count handling', () => {
        const result = calculateStability([0, 0], true);
        expect(result.stabilityColour).toBe('green');
        expect(result.stabilityScore).toBe(1.0);
    });
});
