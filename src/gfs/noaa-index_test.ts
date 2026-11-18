import { describe, expect, it } from 'vitest';
import { candidateRuns, fieldRange, fileUrl, forecastHour } from './noaa-index.ts';

const H = 3_600_000;
const IDX = [
  '275:17800000:d=2026111700:HGT:250 mb:12 hour fcst:',
  '276:17836088:d=2026111700:UGRD:250 mb:12 hour fcst:',
  '277:17889430:d=2026111700:VGRD:250 mb:12 hour fcst:',
  '278:17941000:d=2026111700:UGRD:10 m above ground:12 hour fcst:',
  '279:17990000:d=2026111700:VGRD:10 m above ground:12 hour fcst:',
].join('\n');

describe('fileUrl', () => {
  it('builds the object URL', () => {
    const run = Date.UTC(2026, 10, 17, 0);
    expect(fileUrl(run, 12)).toBe(
      'https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.20261117/00/atmos/gfs.t00z.pgrb2.1p00.f012');
    expect(fileUrl(run, 3)).toMatch(/\.f003$/);
  });
});

describe('fieldRange', () => {
  it('finds pressure level and surface fields', () => {
    expect(fieldRange(IDX, 'UGRD', { hpa: 250 })).toEqual({ start: 17836088, end: 17889429 });
    expect(fieldRange(IDX, 'UGRD', { surface: true })).toEqual({ start: 17941000, end: 17989999 });
  });
  it('returns undefined for last line and absent fields', () => {
    expect(fieldRange(IDX, 'VGRD', { surface: true })).toBeUndefined();
    expect(fieldRange(IDX, 'TMP', { hpa: 250 })).toBeUndefined();
  });
  it('does not match 25 hPa against 250 mb', () => {
    expect(fieldRange(IDX, 'UGRD', { hpa: 25 })).toBeUndefined();
  });
  it('matches anl lines', () => {
    const idx = '1:0:d=2026111700:UGRD:250 mb:anl:\n2:100:d=2026111700:VGRD:250 mb:anl:';
    expect(fieldRange(idx, 'UGRD', { hpa: 250 })).toEqual({ start: 0, end: 99 });
  });
});

describe('candidateRuns', () => {
  it('lists four runs newest first', () => {
    expect(candidateRuns(Date.UTC(2026, 10, 17, 15, 32))).toEqual([
      Date.UTC(2026, 10, 17, 12),
      Date.UTC(2026, 10, 17, 6),
      Date.UTC(2026, 10, 17, 0),
      Date.UTC(2026, 10, 16, 18),
    ]);
  });
});

describe('forecastHour', () => {
  const run = Date.UTC(2026, 10, 17, 0);
  it('rounds to the nearest 3 h file', () => {
    expect(forecastHour(run, run + 13.4 * H)).toBe(12);
    expect(forecastHour(run, run + 13.6 * H)).toBe(15);
    expect(forecastHour(run, run + 13.5 * H)).toBe(15);
  });
  it('is undefined outside 0..384', () => {
    expect(forecastHour(run, run - 2 * H)).toBeUndefined();
    expect(forecastHour(run, run + 385 * H)).toBeUndefined();
    expect(forecastHour(run, run + 384 * H)).toBe(384);
  });
});
