import {describe, expect, test} from 'vitest';
import {airspacesAt, parseAirspaces} from './airspace.ts';

// Made-up areas in the layout of X-Plane's airspaces/airspace.txt. Nothing here is copied from real data.
const square = (cls: string, name: string, al: string, ah: string, lat = 37, lon = -122): string =>
  [
    `AC ${cls}`, `AN ${name}`, `AL ${al}`, `AH ${ah}`,
    `DP ${lat}:00:00 N ${-lon}:00:00 W`,
    `DP ${lat + 1}:00:00 N ${-lon}:00:00 W`,
    `DP ${lat + 1}:00:00 N ${-lon + 1}:00:00 W`,
    `DP ${lat}:00:00 N ${-lon + 1}:00:00 W`,
  ].join('\n');

describe('parseAirspaces', () => {
  test('reads an area with class, name, limits and points', () => {
    const a = parseAirspaces(['AC R', 'AN TEST AREA', 'AL GND', 'AH 4500 MSL', 'DP 37:30:00 N 122:15:00 W', 'DP 37:45:00 N 122:15:00 W', 'DP 37:45:00 N 122:30:00 W'].join('\n'));
    expect(a).toEqual([{
      class: 'R', name: 'TEST AREA', floor: {ft: 0, ref: 'GND'}, ceiling: {ft: 4500, ref: 'MSL'},
      ring: [{lat: 37.5, lon: -122.25}, {lat: 37.75, lon: -122.25}, {lat: 37.75, lon: -122.5}],
    }]);
  });

  test('reads several areas separated by blank lines', () => {
    const a = parseAirspaces(`${square('D', 'ONE', 'GND', '2500 MSL')}\n\n${square('C', 'TWO', '1200 MSL', '4000 MSL', 40)}\n`);
    expect(a.map((x) => x.name)).toEqual(['ONE', 'TWO']);
    expect(a[1]!.floor).toEqual({ft: 1200, ref: 'MSL'});
  });

  test('reads seconds and south/east hemispheres', () => {
    const a = parseAirspaces(['AC A', 'AN SOUTH', 'AL 19500 MSL', 'AH 66000 MSL', 'DP 03:30:30 S 145:00:00 E', 'DP 04:00:00 S 145:00:00 E', 'DP 04:00:00 S 146:00:00 E'].join('\n'));
    expect(a[0]!.ring[0]!.lat).toBeCloseTo(-3.508333, 6);
    expect(a[0]!.ring[0]!.lon).toBeCloseTo(145, 6);
  });

  test('skips an area with fewer than 3 points, and unknown lines', () => {
    const a = parseAirspaces(['AC R', 'AN SHORT', 'AL GND', 'AH 1000 MSL', 'DP 37:00:00 N 122:00:00 W', 'DP 38:00:00 N 122:00:00 W', 'XX something', '', square('D', 'GOOD', 'GND', '2500 MSL')].join('\n'));
    expect(a.map((x) => x.name)).toEqual(['GOOD']);
  });

  test('skips an area with an unreadable limit', () => {
    expect(parseAirspaces(square('D', 'BAD', 'SFC', '2500 MSL'))).toEqual([]);
  });

  test('reads CRLF text the same as LF', () => {
    const lf = `${square('D', 'ONE', 'GND', '2500 MSL')}\n`;
    expect(parseAirspaces(lf.replace(/\n/g, '\r\n'))).toEqual(parseAirspaces(lf));
  });
});

describe('airspacesAt', () => {
  const all = parseAirspaces(square('R', 'BOX', 'GND', '4500 MSL'));

  test('finds the containing area and respects limits', () => {
    expect(airspacesAt(all, 37.5, -122.5, 3000).map((a) => a.name)).toEqual(['BOX']);
    expect(airspacesAt(all, 37.5, -122.5, 6000)).toEqual([]);
    expect(airspacesAt(all, 37.5, -122.5).map((a) => a.name)).toEqual(['BOX']);
    expect(airspacesAt(all, 30, -100)).toEqual([]);
  });

  test('handles an area across the antimeridian', () => {
    const am = parseAirspaces(['AC A', 'AN DATELINE', 'AL GND', 'AH 66000 MSL', 'DP 01:00:00 N 179:00:00 E', 'DP 01:00:00 N 179:00:00 W', 'DP 01:00:00 S 179:00:00 W', 'DP 01:00:00 S 179:00:00 E'].join('\n'));
    expect(airspacesAt(am, 0, 179.5)).toHaveLength(1);
    expect(airspacesAt(am, 0, -179.5)).toHaveLength(1);
    expect(airspacesAt(am, 0, 0)).toEqual([]);
  });
});
