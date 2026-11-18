import { describe, expect, it } from 'vitest';
import { magneticToTrue, trueToMagnetic } from './magnetic.ts';

describe('true and magnetic', () => {
  it('takes east variation off a true direction', () => {
    expect(trueToMagnetic(100, 13.5)).toBeCloseTo(86.5, 9);
    expect(trueToMagnetic(100, -10)).toBeCloseTo(110, 9);
  });
  it('adds it back', () => {
    expect(magneticToTrue(86.5, 13.5)).toBeCloseTo(100, 9);
  });
  it('wraps through north', () => {
    expect(trueToMagnetic(5, 13)).toBeCloseTo(352, 9);
    expect(magneticToTrue(352, 13)).toBeCloseTo(5, 9);
    expect(trueToMagnetic(360, 0)).toBe(0);
  });
});
