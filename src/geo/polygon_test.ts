import { describe, expect, it } from 'vitest';
import { pointInPolygon } from './polygon.ts';

const square = [
  { lat: 10, lon: 10 },
  { lat: 10, lon: 20 },
  { lat: 20, lon: 20 },
  { lat: 20, lon: 10 },
];

describe('pointInPolygon', () => {
  it('tells inside from outside', () => {
    expect(pointInPolygon(15, 15, square)).toBe(true);
    expect(pointInPolygon(15, 25, square)).toBe(false);
    expect(pointInPolygon(25, 15, square)).toBe(false);
    expect(pointInPolygon(5, 5, square)).toBe(false);
  });
  it('does not mind which way round the ring runs, or a repeated first corner', () => {
    expect(pointInPolygon(15, 15, [...square].reverse())).toBe(true);
    expect(pointInPolygon(15, 15, [...square, square[0]!])).toBe(true);
    expect(pointInPolygon(15, 25, [...square, square[0]!])).toBe(false);
  });
  it('handles a dent', () => {
    // An L: the square with its upper-right quarter taken out.
    const ell = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 10 },
      { lat: 5, lon: 10 },
      { lat: 5, lon: 5 },
      { lat: 10, lon: 5 },
      { lat: 10, lon: 0 },
    ];
    expect(pointInPolygon(2, 8, ell)).toBe(true);
    expect(pointInPolygon(8, 2, ell)).toBe(true);
    expect(pointInPolygon(8, 8, ell)).toBe(false);
  });
  it('handles a ring across the antimeridian, with the position given either side', () => {
    const pacific = [
      { lat: 40, lon: 170 },
      { lat: 40, lon: -170 },
      { lat: 50, lon: -170 },
      { lat: 50, lon: 170 },
    ];
    expect(pointInPolygon(45, 179, pacific)).toBe(true);
    expect(pointInPolygon(45, -179, pacific)).toBe(true);
    expect(pointInPolygon(45, 180, pacific)).toBe(true);
    expect(pointInPolygon(45, 160, pacific)).toBe(false);
    expect(pointInPolygon(45, -160, pacific)).toBe(false);
    expect(pointInPolygon(45, 0, pacific)).toBe(false);
    expect(pointInPolygon(55, 179, pacific)).toBe(false);
  });
  it('is false for less than a triangle', () => {
    expect(pointInPolygon(1, 1, [])).toBe(false);
    expect(pointInPolygon(1, 1, square.slice(0, 2))).toBe(false);
  });
});
