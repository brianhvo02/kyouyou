import {describe, expect, test} from 'vitest';
import {airwayRuns, parseAwySegments} from './awy.ts';

// Made-up airway segments in the layout of X-Plane's earth_awy.dat. Nothing here is copied from real
// data. Cases follow Kōro's airway reader tests.
const file = (rows: string[], version = '1100') => ['I', `${version} Version - made-up`, '', ...rows, '99', ''].join('\n');
const seg = (a: string, b: string, names = 'J1', dir = 'N', layer = '2') => `${a} ZZ 11 ${b} ZZ 11 ${dir} ${layer} 180 450 ${names}`;
const runs = (rows: string[]) => airwayRuns(parseAwySegments(file(rows)));
const ids = (r: {points: Array<{ident: string}>}) => r.points.map((p) => p.ident);

describe('parseAwySegments', () => {
  test('reads both ends, direction, layer, flight levels and names split on -', () => {
    expect(parseAwySegments(file(['TSTA ZZ 3 TSTB ZY 11 F 1 50 180 V1-V2']))).toEqual([{
      from: {ident: 'TSTA', region: 'ZZ', type: 3}, to: {ident: 'TSTB', region: 'ZY', type: 11},
      direction: 'F', high: false, baseFl: 50, topFl: 180, names: ['V1', 'V2'],
    }]);
  });

  test('reads 1100 and 1101, and nothing for another version', () => {
    expect(parseAwySegments(file([seg('TSTA', 'TSTB')], '1101'))).toHaveLength(1);
    expect(parseAwySegments(file([seg('TSTA', 'TSTB')], '1200'))).toEqual([]);
  });

  test('skips a row with an unknown direction or layer', () => {
    expect(parseAwySegments(file([seg('TSTA', 'TSTB', 'J1', 'X'), seg('TSTA', 'TSTB', 'J1', 'N', '3')]))).toEqual([]);
  });
});

describe('airwayRuns', () => {
  test('joins contiguous segments into one run, high and low apart', () => {
    const r = runs([seg('TSTA', 'TSTB'), seg('TSTB', 'TSTC'), seg('TSTA', 'TSTB', 'V1', 'N', '1')]);
    expect(r.map((x) => [x.airway, x.high, ids(x)])).toEqual([['J1', true, ['TSTA', 'TSTB', 'TSTC']], ['V1', false, ['TSTA', 'TSTB']]]);
  });

  test('gives a shared segment to each named airway', () => {
    expect(runs([seg('TSTA', 'TSTB', 'J1-J2')]).map((x) => x.airway)).toEqual(['J1', 'J2']);
  });

  test('joins segments listed out of airway order', () => {
    expect(runs([seg('TSTC', 'TSTD'), seg('TSTA', 'TSTB'), seg('TSTB', 'TSTC')]).map(ids)).toEqual([['TSTD', 'TSTC', 'TSTB', 'TSTA']]);
  });

  test('ends runs at a branch point and keeps every segment', () => {
    const r = runs([seg('TSTA', 'TSTB'), seg('TSTB', 'TSTC'), seg('TSTB', 'TSTD')]);
    expect(r.reduce((n, x) => n + x.points.length - 1, 0)).toBe(3);
    expect(r.every((x) => ids(x)[0] === 'TSTB' || ids(x).at(-1) === 'TSTB')).toBe(true);
  });

  test('keeps a closed loop as one run', () => {
    expect(runs([seg('TSTA', 'TSTB'), seg('TSTB', 'TSTC'), seg('TSTC', 'TSTA')]).map((x) => x.points.length)).toEqual([4]);
  });

  test('records one-way segments in run order, forward and backward', () => {
    const [r] = runs([seg('TSTA', 'TSTB', 'J1', 'F'), seg('TSTB', 'TSTC', 'J1', 'B')]);
    expect(ids(r!)).toEqual(['TSTA', 'TSTB', 'TSTC']);
    expect(r!.directions).toEqual(['forward', 'backward']);
  });

  test('a segment listed one-way in each direction is two-way', () => {
    const [r] = runs([seg('TSTA', 'TSTB', 'J1', 'F'), seg('TSTB', 'TSTA', 'J1', 'F')]);
    expect(r!.directions).toBeUndefined();
  });

  test('keeps the same ident in two regions apart', () => {
    const r = airwayRuns(parseAwySegments(file(['TSTA ZZ 11 TSTB ZZ 11 N 2 180 450 J1', 'TSTB ZY 11 TSTC ZZ 11 N 2 180 450 J1'])));
    expect(r).toHaveLength(2);
  });
});
