import { describe, expect, it } from 'vitest';
import { distanceNm, initialBearingDeg } from './geo.ts';
import { alongTrackNm, crossTrackNm, destinationPoint } from './track.ts';

describe('destinationPoint', () => {
  it('goes a degree of latitude in 60 NM due north', () => {
    const p = destinationPoint(37, -122, 0, 60);
    expect(p.lat).toBeCloseTo(38, 2);
    expect(p.lon).toBeCloseTo(-122, 6);
  });
  it('agrees with distance and bearing back from where it lands', () => {
    for (const [lat, lon, brg, nm] of [[37.6, -122.4, 284, 10], [51.5, -0.5, 93, 250], [-33.9, 151.2, 200, 1200], [64, -22, 45, 30]] as const) {
      const p = destinationPoint(lat, lon, brg, nm);
      expect(distanceNm(lat, lon, p.lat, p.lon)).toBeCloseTo(nm, 6);
      expect(initialBearingDeg(lat, lon, p.lat, p.lon)).toBeCloseTo(brg, 5);
    }
  });
  it('keeps longitude within -180..180 across the antimeridian', () => {
    const p = destinationPoint(0, 179.5, 90, 60);
    expect(p.lon).toBeCloseTo(-179.5, 2);
  });
});

describe('crossTrackNm and alongTrackNm', () => {
  // A course due north from 37N 122W: east of it is right.
  const from = [37, -122] as const;
  it('is zero across for a point on the course, and its distance along', () => {
    const p = destinationPoint(...from, 0, 25);
    expect(crossTrackNm(p.lat, p.lon, ...from, 0)).toBeCloseTo(0, 6);
    expect(alongTrackNm(p.lat, p.lon, ...from, 0)).toBeCloseTo(25, 6);
  });
  it('is positive right of the course and negative left', () => {
    const ahead = destinationPoint(...from, 0, 20);
    const right = destinationPoint(ahead.lat, ahead.lon, 90, 3);
    const left = destinationPoint(ahead.lat, ahead.lon, 270, 3);
    expect(crossTrackNm(right.lat, right.lon, ...from, 0)).toBeCloseTo(3, 2);
    expect(crossTrackNm(left.lat, left.lon, ...from, 0)).toBeCloseTo(-3, 2);
    expect(alongTrackNm(right.lat, right.lon, ...from, 0)).toBeCloseTo(20, 2);
  });
  it('is negative along for a point behind', () => {
    const behind = destinationPoint(...from, 180, 8);
    expect(alongTrackNm(behind.lat, behind.lon, ...from, 0)).toBeCloseTo(-8, 6);
    const behindRight = destinationPoint(behind.lat, behind.lon, 90, 2);
    expect(alongTrackNm(behindRight.lat, behindRight.lon, ...from, 0)).toBeCloseTo(-8, 1);
    expect(crossTrackNm(behindRight.lat, behindRight.lon, ...from, 0)).toBeCloseTo(2, 1);
  });
  it('works on a slanted course: a final on 284 to a threshold', () => {
    // 6 NM out on the reciprocal (104), then 1 NM to the left of the inbound course as flown.
    const out = destinationPoint(37.6, -122.4, 104, 6);
    const off = destinationPoint(out.lat, out.lon, 194, 1);
    // Measured from the threshold along the inbound course, the aircraft is 6 NM behind it and 1 NM left.
    expect(alongTrackNm(off.lat, off.lon, 37.6, -122.4, 284)).toBeCloseTo(-6, 1);
    expect(crossTrackNm(off.lat, off.lon, 37.6, -122.4, 284)).toBeCloseTo(-1, 1);
  });
  it('is zero at the point itself', () => {
    expect(alongTrackNm(...from, ...from, 123)).toBe(0);
    expect(crossTrackNm(...from, ...from, 123)).toBeCloseTo(0, 9);
  });
});
