import {describe, expect, test} from 'vitest';
import {declination} from './magnetic.ts';

// NOAA/NCEI's published WMM2025 test values (WMM2025_TEST_VALUES.txt, public domain):
// [decimal year, height km above the WGS84 ellipsoid, geodetic lat, lon, declination deg].
const NOAA: Array<[number, number, number, number, number]> = [
    [2025.0, 0.0, 80.0, 0.0, 1.28],
    [2025.0, 0.0, 0.0, 120.0, -0.16],
    [2025.0, 0.0, -80.0, 240.0, 68.78],
    [2025.0, 100.0, 80.0, 0.0, 0.85],
    [2025.0, 100.0, 0.0, 120.0, -0.15],
    [2025.0, 100.0, -80.0, 240.0, 68.21],
    [2027.5, 0.0, 80.0, 0.0, 2.59],
    [2027.5, 0.0, 0.0, 120.0, -0.24],
    [2027.5, 0.0, -80.0, 240.0, 68.49],
    [2027.5, 100.0, 80.0, 0.0, 2.16],
    [2027.5, 100.0, 0.0, 120.0, -0.23],
    [2027.5, 100.0, -80.0, 240.0, 67.93],
];

/** The UTC instant of a decimal year. */
function at(year: number): Date {
  const y = Math.floor(year);
  const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  return new Date(start + (year - y) * (end - start));
}

describe('declination (WMM2025)', () => {
  test.each(NOAA)('matches NOAA at %s, %s km, %s, %s', (year, km, lat, lon, want) => {
    expect(declination(lat, lon, km * 1000 / 0.3048, at(year))).toBeCloseTo(want, 1);
    expect(Math.abs(declination(lat, lon, km * 1000 / 0.3048, at(year)) - want)).toBeLessThan(0.006);
  });

  test('defaults to sea level and today', () => {
    expect(Number.isFinite(declination(37.6, -122.4))).toBe(true);
  });
});
