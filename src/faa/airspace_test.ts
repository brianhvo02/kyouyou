import {describe, expect, test} from 'vitest';
import {parseRestrictiveAirspace} from './airspace.ts';
import {airspacesAt} from '../xplane/airspace.ts';
import {distanceNm} from '../geo/geo.ts';

// Made-up records in the 132-column ARINC 424-18 UR layout, built by placing each field at its 1-based
// column. Nothing here is copied from the FAA's file or any other real data.
function record(fields: Readonly<Record<number, string>>): string {
  const cols = new Array<string>(132).fill(' ');
  for (const [col, value] of Object.entries(fields)) {
    for (let i = 0; i < value.length; i++) cols[Number(col) - 1 + i] = value[i]!;
  }
  return cols.join('');
}

interface Ur {
  type?: string; name?: string; multi?: string; seq: string; cont?: string; via: string; lat?: string; lon?: string;
  originLat?: string; originLon?: string; dist?: string; bearing?: string;
  lower?: string; lowerUnit?: string; upper?: string; upperUnit?: string; areaName?: string; time?: string; notam?: string;
}
const ur = (u: Ur): string =>
  record({
    1: 'S', 2: 'USA', 5: 'U', 6: 'R', 7: 'K2', 9: u.type ?? 'R', 10: u.name ?? 'TEST1', 20: u.multi ?? 'A',
    21: u.seq, 25: u.cont ?? '1', 27: u.time ?? ' ', 28: u.notam ?? ' ', 31: u.via, 33: u.lat ?? '', 42: u.lon ?? '',
    52: u.originLat ?? '', 61: u.originLon ?? '', 71: u.dist ?? '', 75: u.bearing ?? '',
    82: u.lower ?? '', 87: u.lowerUnit ?? '', 88: u.upper ?? '', 93: u.upperUnit ?? '', 94: u.areaName ?? '',
    124: '12345', 129: '2611',
  });

// A made-up square, about 6 NM a side, at N40 W100.
const square = (extra: Partial<Ur> = {}): string[] => [
  ur({seq: '0010', via: 'G ', lat: 'N40000000', lon: 'W100000000', lower: 'GND', lowerUnit: 'A', upper: '18000', upperUnit: 'M', areaName: 'TEST AREA ONE', ...extra}),
  ur({seq: '0020', via: 'G ', lat: 'N40000000', lon: 'W099520000', ...extra}),
  ur({seq: '0030', via: 'H ', lat: 'N40060000', lon: 'W099520000', ...extra}),
  ur({seq: '0040', via: 'GE', lat: 'N40060000', lon: 'W100000000', ...extra}),
];

describe('parseRestrictiveAirspace', () => {
  test('the record helper places fields at their columns', () => {
    const r = ur({seq: '0010', via: 'G ', lat: 'N40000000', lon: 'W100000000'});
    expect(r).toHaveLength(132);
    expect(r.slice(4, 6)).toBe('UR');
    expect(r.slice(30, 32)).toBe('G ');
    expect(r.slice(32, 41)).toBe('N40000000');
  });

  test('reads a straight-sided area with its identity, limits and name', () => {
    const {areas, skipped} = parseRestrictiveAirspace(square());
    expect(skipped).toEqual([]);
    expect(areas).toHaveLength(1);
    const a = areas[0]!;
    expect(a).toMatchObject({
      class: 'R', designation: 'TEST1', region: 'K2', multipleCode: 'A', name: 'TEST AREA ONE',
      floor: {ft: 0, ref: 'GND'}, ceiling: {ft: 18000, ref: 'MSL'}, floorText: 'GND A', ceilingText: '18000 M',
      timeCode: null, notam: null,
    });
    expect(a.ring).toHaveLength(4);
    expect(a.ring[0]!.lat).toBeCloseTo(40, 6);
    expect(a.ring[0]!.lon).toBeCloseTo(-100, 6);
    expect(airspacesAt(areas, 40.05, -99.93, 10000)).toHaveLength(1);
    expect(airspacesAt(areas, 40.05, -99.93, 20000)).toHaveLength(0);
  });

  test('reads every restrictive type as written', () => {
    for (const t of ['R', 'P', 'M', 'W', 'A', 'D', 'T', 'C', 'U']) {
      expect(parseRestrictiveAirspace(square({type: t})).areas[0]!.class).toBe(t);
    }
  });

  test('areas sharing a designation are told apart by multiple code', () => {
    const {areas} = parseRestrictiveAirspace([...square({multi: 'A'}), ...square({multi: 'B'})]);
    expect(areas.map((a) => a.multipleCode)).toEqual(['A', 'B']);
  });

  test('reads time code and NOTAM flag as written', () => {
    const a = parseRestrictiveAirspace(square({time: 'H', notam: 'N'})).areas[0]!;
    expect(a).toMatchObject({timeCode: 'H', notam: 'N'});
  });

  test('flight levels, MSL and AGL feet, UNLTD and NOTSP', () => {
    const lim = (lower: string, lu: string, upper: string, uu: string) =>
      parseRestrictiveAirspace(square({lower, lowerUnit: lu, upper, upperUnit: uu})).areas[0]!;
    expect(lim('01000', 'A', 'FL180', 'M')).toMatchObject({floor: {ft: 1000, ref: 'GND'}, ceiling: {ft: 18000, ref: 'MSL'}});
    expect(lim('05000', 'M', 'UNLTD', 'M')).toMatchObject({floor: {ft: 5000, ref: 'MSL'}, ceiling: {ft: Infinity, ref: 'MSL'}});
    expect(lim('NOTSP', ' ', 'NOTSP', ' ')).toMatchObject({floor: {ft: 0, ref: 'GND'}, ceiling: {ft: Infinity, ref: 'MSL'}, floorText: 'NOTSP', ceilingText: 'NOTSP'});
  });

  test('MSL means sea level, and a NOTAM limit counts as unknown', () => {
    const lim = (lower: string, lu: string, upper: string, uu: string) =>
      parseRestrictiveAirspace(square({lower, lowerUnit: lu, upper, upperUnit: uu})).areas[0]!;
    expect(lim('MSL', ' ', '03000', 'M')).toMatchObject({floor: {ft: 0, ref: 'MSL'}, floorText: 'MSL'});
    expect(lim('NOTAM', ' ', 'NOTAM', ' ')).toMatchObject({floor: {ft: 0, ref: 'GND'}, ceiling: {ft: Infinity, ref: 'MSL'}, floorText: 'NOTAM', ceilingText: 'NOTAM'});
  });

  test('a circle becomes points no more than 1 NM apart at its radius', () => {
    const {areas} = parseRestrictiveAirspace([
      ur({seq: '0010', via: 'CE', originLat: 'N40000000', originLon: 'W100000000', dist: '0050', lower: 'GND', lowerUnit: 'A', upper: '05000', upperUnit: 'M'}),
    ]);
    const ring = areas[0]!.ring;
    expect(ring.length).toBeGreaterThanOrEqual(32);
    for (const p of ring) expect(distanceNm(40, -100, p.lat, p.lon)).toBeCloseTo(5, 2);
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
      expect(distanceNm(p.lat, p.lon, q.lat, q.lon)).toBeLessThanOrEqual(1.0001);
    }
    expect(airspacesAt(areas, 40, -100, 1000)).toHaveLength(1);
  });

  test('a clockwise arc sweeps clockwise around its origin to the next point', () => {
    // From due north of the origin, clockwise (through east) to due south, then a straight line back.
    const {areas} = parseRestrictiveAirspace([
      ur({seq: '0010', via: 'R ', lat: 'N40050000', lon: 'W100000000', originLat: 'N40000000', originLon: 'W100000000', dist: '0050', bearing: '0000', lower: 'GND', lowerUnit: 'A', upper: '05000', upperUnit: 'M'}),
      ur({seq: '0020', via: 'GE', lat: 'N39550000', lon: 'W100000000'}),
    ]);
    const ring = areas[0]!.ring;
    expect(ring.some((p) => p.lon > -99.95)).toBe(true); // bulges east
    expect(ring.some((p) => p.lon < -100.05)).toBe(false);
    expect(airspacesAt(areas, 40, -99.95, 1000)).toHaveLength(1);
    expect(airspacesAt(areas, 40, -100.05, 1000)).toHaveLength(0);
  });

  test('a counter-clockwise arc bulges the other way', () => {
    const {areas} = parseRestrictiveAirspace([
      ur({seq: '0010', via: 'L ', lat: 'N40050000', lon: 'W100000000', originLat: 'N40000000', originLon: 'W100000000', dist: '0050', bearing: '0000', lower: 'GND', lowerUnit: 'A', upper: '05000', upperUnit: 'M'}),
      ur({seq: '0020', via: 'GE', lat: 'N39550000', lon: 'W100000000'}),
    ]);
    expect(airspacesAt(areas, 40, -100.05, 1000)).toHaveLength(1);
    expect(airspacesAt(areas, 40, -99.95, 1000)).toHaveLength(0);
  });

  test('continuation records (2 and up) are passed over', () => {
    const lines = square();
    lines.splice(1, 0, ur({seq: '0010', cont: '2', via: '  '}));
    const {areas, skipped} = parseRestrictiveAirspace(lines);
    expect(skipped).toEqual([]);
    expect(areas[0]!.ring).toHaveLength(4);
  });

  test('other records and sections are ignored, not skipped', () => {
    const {areas, skipped} = parseRestrictiveAirspace([
      'HDR01FAACIFP18',
      record({1: 'S', 2: 'USA', 5: 'U', 6: 'C', 7: 'K2'}),
      record({1: 'S', 2: 'USA', 5: 'P', 7: 'KTST'}),
      ...square(),
    ]);
    expect(areas).toHaveLength(1);
    expect(skipped).toEqual([]);
  });

  test('an area with an unreadable point, an unreadable limit or under three points is left out and listed', () => {
    const bad = (extra: Partial<Ur>, at = 1) => {
      const lines = square({name: 'BAD'});
      lines[at] = ur({seq: '0020', via: 'G ', lat: 'N40000000', lon: 'W099520000', name: 'BAD', ...extra});
      return lines;
    };
    const r = parseRestrictiveAirspace([
      ...bad({lat: 'N4X000000'}),
      ...square({name: 'GOOD'}),
      ur({seq: '0010', via: 'G ', lat: 'N40000000', lon: 'W100000000', name: 'TWO', lower: 'GND', lowerUnit: 'A', upper: '05000', upperUnit: 'M'}),
      ur({seq: '0020', via: 'GE', lat: 'N40010000', lon: 'W100000000', name: 'TWO'}),
    ]);
    expect(r.areas.map((a) => a.designation)).toEqual(['GOOD']);
    expect(r.skipped.map((s) => s.reason)).toEqual([
      expect.stringContaining('point'),
      expect.stringContaining('three'),
    ]);
    const lim = parseRestrictiveAirspace(square({lower: 'ABC', lowerUnit: 'M'}));
    expect(lim.areas).toEqual([]);
    expect(lim.skipped[0]!.reason).toContain('limit');
  });

  test('takes a trailing CR and short lines without throwing', () => {
    const r = parseRestrictiveAirspace([...square().map((l) => l + '\r'), 'SUSAUR', '']);
    expect(r.areas).toHaveLength(1);
  });
});
