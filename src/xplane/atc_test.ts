import {describe, expect, test} from 'vitest';
import {controllersAt, parseAtc, tenKhzToKhz} from './atc.ts';

// Made-up controllers in the layout of X-Plane's atc.dat. Nothing here is copied from real data.
const square = (floor: number, ceiling: number, lat = 37, lon = -122): string[] => [
  `AIRSPACE_POLYGON_BEGIN ${floor} ${ceiling}`,
  `POINT ${lat} ${lon}`, `POINT ${lat + 1} ${lon}`, `POINT ${lat + 1} ${lon - 1}`, `POINT ${lat} ${lon - 1}`,
  'AIRSPACE_POLYGON_END',
];
const block = (lines: string[], end = true): string => ['CONTROLLER', ...lines, ...(end ? ['CONTROLLER_END'] : [])].join('\n');
const tower = (name: string, extra: string[] = []): string =>
  block([`NAME ${name}`, 'FACILITY_ID KTST', 'ROLE twr', 'FREQ 11810', ...extra, ...square(0, 2500)]);

describe('parseAtc', () => {
  test('reads a tower with ICAO, transition altitude, class, frequencies and an area', () => {
    const [c] = parseAtc(block([
      'NAME TEST TOWER', 'FACILITY_ID KTST', 'ROLE twr', 'ICAO KTST', 'TRANSITION_ALT 18000', 'CLASS D',
      'FREQ 11810', 'FREQ 11947', 'CHAN 121900', 'VOICE_DEF 1', ...square(0, 2500),
    ]));
    expect(c).toEqual({
      name: 'TEST TOWER', facilityId: 'KTST', role: 'twr', khz: [118100, 119475, 121900],
      areas: [{floorFt: 0, ceilingFt: 2500, ring: [{lat: 37, lon: -122}, {lat: 38, lon: -122}, {lat: 38, lon: -123}, {lat: 37, lon: -123}]}],
      icao: 'KTST', transitionAltitudeFt: 18000, airspaceClass: 'D',
    });
  });

  test('tenKhzToKhz adds 5 to channels ending in 2 or 7', () => {
    expect(tenKhzToKhz(11947)).toBe(119475);
    expect(tenKhzToKhz(11810)).toBe(118100);
    expect(tenKhzToKhz(12192)).toBe(121925);
    expect(tenKhzToKhz(11955)).toBe(119550);
  });

  test('drops duplicate frequencies', () => {
    const [c] = parseAtc(tower('DUP', ['FREQ 11810', 'CHAN 118100']));
    expect(c!.khz).toEqual([118100]);
  });

  test('keeps a CHAN channel name as written', () => {
    const [c] = parseAtc(tower('NAMES', ['CHAN 132005']));
    expect(c!.khz).toContain(132005);
  });

  test('skips a controller with an unknown role', () => {
    expect(parseAtc(block(['NAME GROUND', 'FACILITY_ID KTST', 'ROLE gnd', 'FREQ 12190', ...square(0, 100)]))).toEqual([]);
  });

  test('drops a block without CONTROLLER_END before the next CONTROLLER, and one at end of file', () => {
    const text = [block(['NAME CUT', 'FACILITY_ID KAAA', 'ROLE twr', 'FREQ 11810'], false), tower('KEPT'), block(['NAME LAST', 'ROLE twr', 'FREQ 11810'], false)].join('\n');
    expect(parseAtc(text).map((c) => c.name)).toEqual(['KEPT']);
  });

  test('leaves icao, transitionAltitudeFt and airspaceClass out when absent', () => {
    const [c] = parseAtc(tower('PLAIN'));
    expect(c).not.toHaveProperty('icao');
    expect(c).not.toHaveProperty('transitionAltitudeFt');
    expect(c).not.toHaveProperty('airspaceClass');
  });

  test('reads an open ring (first point not repeated) and a controller with two polygons', () => {
    const [c] = parseAtc(block(['NAME TWO', 'FACILITY_ID ZTST', 'ROLE ctr', 'FREQ 12345', ...square(0, 24000), ...square(24000, 60000, 40)]));
    expect(c!.areas).toHaveLength(2);
    expect(c!.areas[1]).toMatchObject({floorFt: 24000, ceilingFt: 60000});
    expect(c!.areas[0]!.ring).toHaveLength(4);
  });

  test('ignores VOICE_DEF, ALT_REPORT and the header and footer lines', () => {
    const text = ['A', '1000 Version - made-up header', 'ATCFILE', '', tower('T', ['VOICE_DEF 2', 'ALT_REPORT 1']), '99'].join('\r\n');
    expect(parseAtc(text).map((c) => c.name)).toEqual(['T']);
  });
});

describe('controllersAt', () => {
  test('returns twr, then tracon, then ctr whose area contains the point within its limits', () => {
    const all = parseAtc([
      block(['NAME CENTRE', 'FACILITY_ID ZTST', 'ROLE ctr', 'FREQ 12345', ...square(0, 60000)]),
      block(['NAME APPROACH', 'FACILITY_ID TTST', 'ROLE tracon', 'FREQ 12470', ...square(0, 12000)]),
      tower('TOWER'),
    ].join('\n'));
    expect(controllersAt(all, 37.5, -122.5, 2000).map((c) => c.name)).toEqual(['TOWER', 'APPROACH', 'CENTRE']);
    expect(controllersAt(all, 37.5, -122.5, 20000).map((c) => c.name)).toEqual(['CENTRE']);
    expect(controllersAt(all, 37.5, -122.5, 2000)[0]).toMatchObject({floorFt: 0, ceilingFt: 2500});
    expect(controllersAt(all, 10, 10, 2000)).toEqual([]);
  });
});
