import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeGrib2 } from './grib2.ts';
import type { GribField } from './grib2.ts';

interface Expected {
  referenceUtc: string;
  forecastHours: number;
  min: number;
  max: number;
  points: { lat: number; lon: number; value: number }[];
}

// One field from NOAA's GFS (US government work, public domain): UGRD 250 mb, f012 of the
// 2026-11-17 00Z run (gfs.20261117/00/atmos/gfs.t00z.pgrb2.1p00.f012).
const fixture = new Uint8Array(
  readFileSync(new URL('./fixtures/gfs-ugrd-250mb-f012.grb', import.meta.url)),
);
const expected = JSON.parse(
  readFileSync(new URL('./fixtures/gfs-ugrd-250mb-f012.expected.json', import.meta.url), 'utf8'),
) as Expected;

/** Byte offset of the first section with this number, walking from section 1. */
function sectionOffset(bytes: Uint8Array, num: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 16;
  while (pos + 5 <= bytes.length) {
    if (bytes[pos + 4] === num) return pos;
    pos += view.getUint32(pos);
  }
  throw new Error(`section ${num} not found`);
}

function decodeFixture(): GribField {
  const field = decodeGrib2(fixture);
  if (field === undefined) throw new Error('fixture did not decode');
  return field;
}

describe('decodeGrib2', () => {
  it('decodes the fixture header', () => {
    const f = decodeFixture();
    expect(f.discipline).toBe(0);
    expect(f.category).toBe(2);
    expect(f.parameter).toBe(2);
    expect(f.surfaceType).toBe(100);
    expect(f.surfaceValue).toBe(25000);
    expect(f.forecastHours).toBe(12);
    expect(f.nx).toBe(360);
    expect(f.ny).toBe(181);
    expect(f.referenceUtc).toBe(expected.referenceUtc);
    expect(f.values.length).toBe(360 * 181);
  });

  it('matches an independent decoder', () => {
    const f = decodeFixture();
    for (const p of expected.points) {
      const v = f.values[(90 - p.lat) * 360 + p.lon];
      expect(Math.abs(v - p.value), `(${p.lat}, ${p.lon})`).toBeLessThanOrEqual(0.06);
    }
    let min = Infinity;
    let max = -Infinity;
    for (const v of f.values) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(Math.abs(min - expected.min)).toBeLessThanOrEqual(0.06);
    expect(Math.abs(max - expected.max)).toBeLessThanOrEqual(0.06);
  });

  it('refuses a truncated message', () => {
    expect(decodeGrib2(fixture.slice(0, Math.floor(fixture.length / 2)))).toBeUndefined();
  });

  it('refuses a different data template', () => {
    const copy = fixture.slice();
    const s5 = sectionOffset(copy, 5);
    copy[s5 + 9] = 0;
    copy[s5 + 10] = 40;
    expect(decodeGrib2(copy)).toBeUndefined();
  });

  it('refuses a different grid', () => {
    const copy = fixture.slice();
    const s3 = sectionOffset(copy, 3);
    // Octets 7-10: number of data points.
    new DataView(copy.buffer).setUint32(s3 + 6, 360 * 180);
    expect(decodeGrib2(copy)).toBeUndefined();
  });

  it('refuses bytes that are not GRIB', () => {
    expect(decodeGrib2(new Uint8Array(100))).toBeUndefined();
  });
});
