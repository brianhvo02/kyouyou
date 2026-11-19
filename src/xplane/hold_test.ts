import {describe, expect, test} from 'vitest';
import {parseHolds} from './hold.ts';

// Made-up holds in the layout of X-Plane's earth_hold.dat. Nothing here is copied from real data.
const file = (rows: string[], version = '1140') => ['I', `${version} Version - made-up`, '', ...rows, '99', ''].join('\n');

describe('parseHolds', () => {
  test('reads a timed enroute hold and a DME terminal hold, with 0 as none', () => {
    expect(parseHolds(file(['TSTA ZZ ENRT 3 178.0 1.0 0.0 L 5000 0 0', 'TSTB ZZ KTST 11 92.5 0.0 4.5 R 3000 9000 210']))).toEqual([
      {ident: 'TSTA', region: 'ZZ', airport: null, fixType: 3, inboundCourseDeg: 178, legTimeMin: 1, legDistanceNm: null, turn: 'L', minAltFt: 5000, maxAltFt: null, speedKt: null},
      {ident: 'TSTB', region: 'ZZ', airport: 'KTST', fixType: 11, inboundCourseDeg: 92.5, legTimeMin: null, legDistanceNm: 4.5, turn: 'R', minAltFt: 3000, maxAltFt: 9000, speedKt: 210},
    ]);
  });

  test('skips a malformed row and returns nothing for another version', () => {
    expect(parseHolds(file(['TSTA ZZ ENRT 3 178.0 1.0 0.0 X 5000 0 0', 'TSTA ZZ ENRT 3 north 1.0 0.0 L 5000 0 0']))).toEqual([]);
    expect(parseHolds(file(['TSTA ZZ ENRT 3 178.0 1.0 0.0 L 5000 0 0'], '1100'))).toEqual([]);
  });
});
