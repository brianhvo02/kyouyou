import { describe, expect, it } from 'vitest';
import { distanceNm, initialBearingDeg, intermediatePoint, nearest } from './geo.ts';

describe('distanceNm', () => {
  it('computes KATL-KORD', () => {
    expect(Math.abs(distanceNm(33.6367, -84.4281, 41.9786, -87.9048) - 528)).toBeLessThan(2);
  });
  it('is zero for identical points', () => {
    expect(distanceNm(10, 20, 10, 20)).toBe(0);
  });
});

describe('initialBearingDeg', () => {
  it('is 90 due east', () => {
    expect(initialBearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 5);
  });
  it('is 270 due west and within 0-360', () => {
    expect(initialBearingDeg(0, 0, 0, -1)).toBeCloseTo(270, 5);
  });
  it('is 0 due north', () => {
    expect(initialBearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 5);
  });
});

describe('nearest', () => {
  it('returns undefined for empty input', () => {
    expect(nearest([], 0, 0)).toBeUndefined();
  });
  it('returns the closest candidate', () => {
    const cands = [
      { id: 'a', lat: 0, lon: 10 },
      { id: 'b', lat: 0, lon: 1 },
      { id: 'c', lat: 5, lon: 5 },
    ];
    expect(nearest(cands, 0, 0)?.id).toBe('b');
  });
});

describe('intermediatePoint', () => {
  it('returns the endpoints at fractions 0 and 1', () => {
    const a = intermediatePoint(33.6367, -84.4281, 41.9786, -87.9048, 0);
    const b = intermediatePoint(33.6367, -84.4281, 41.9786, -87.9048, 1);
    expect(a.lat).toBeCloseTo(33.6367, 4);
    expect(a.lon).toBeCloseTo(-84.4281, 4);
    expect(b.lat).toBeCloseTo(41.9786, 4);
    expect(b.lon).toBeCloseTo(-87.9048, 4);
  });
  it('splits the distance evenly at the midpoint', () => {
    const m = intermediatePoint(33.6367, -84.4281, 41.9786, -87.9048, 0.5);
    const total = distanceNm(33.6367, -84.4281, 41.9786, -87.9048);
    expect(distanceNm(33.6367, -84.4281, m.lat, m.lon)).toBeCloseTo(total / 2, 1);
  });
  it('handles identical points', () => {
    expect(intermediatePoint(10, 20, 10, 20, 0.5)).toEqual({ lat: 10, lon: 20 });
  });
});
