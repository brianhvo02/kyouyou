import {describe, expect, test} from 'vitest';
import {parseFix} from './fix.ts';

// Made-up fixes in the layout of X-Plane's earth_fix.dat. Nothing here is copied from real data.
const file = (version: string, rows: string[]) => ['I', `${version} Version - made-up`, '', ...rows, '99', ''].join('\n');

describe('parseFix', () => {
  test('reads an enroute and a terminal fix with the 1200 type and name', () => {
    expect(parseFix(file('1200', [' 10.500000000  -20.250000000  TSTAA ENRT ZZ 2105430 TEST POINT ONE', ' 11.000000000  -21.000000000  TSTBB KTST ZZ 4530263 TSTBB']))).toEqual([
      {ident: 'TSTAA', region: 'ZZ', airport: null, lat: 10.5, lon: -20.25, type: 2105430, name: 'TEST POINT ONE'},
      {ident: 'TSTBB', region: 'ZZ', airport: 'KTST', lat: 11, lon: -21, type: 4530263, name: 'TSTBB'},
    ]);
  });

  test('reads a 1101 row with only five columns', () => {
    expect(parseFix(file('1101', ['10.5 -20.25 TSTAA ENRT ZZ']))).toEqual([{ident: 'TSTAA', region: 'ZZ', airport: null, lat: 10.5, lon: -20.25, type: null, name: null}]);
  });

  test('skips a malformed row', () => {
    expect(parseFix(file('1200', ['north -20.25 TSTAA ENRT ZZ', '10.5 -20.25 TSTAA']))).toEqual([]);
  });

  test('returns nothing for an unsupported version', () => {
    expect(parseFix(file('9999', ['10.5 -20.25 TSTAA ENRT ZZ']))).toEqual([]);
  });
});
