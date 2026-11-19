import {describe, expect, test} from 'vitest';
import {parseNav} from './nav.ts';

// Made-up navaids in the layout of X-Plane's earth_nav.dat. Nothing here is copied from real data.
const file = (version: string, rows: string[]) => ['I', `${version} Version - made-up`, '', ...rows, '99', ''].join('\n');

describe('parseNav', () => {
  const all = parseNav(file('1200', [
    ' 2  10.500000000  -20.250000000        0      300    50      0.000   TSTA  ENRT ZZ TESTVILLE NDB',
    ' 3  11.250000000  -21.750000000      100    11500   130      5.000   TSTB  ENRT ZZ TEST BEACON VORTAC',
    ' 4  12.000000000  -22.000000000       50    11000    25  32490.000   ITST  KTST ZZ 09 ILS-cat-I',
    ' 6  12.000000000  -22.100000000       50    11000    25 300090.000   ITST  KTST ZZ 09 GS',
    ' 7  12.000000000  -21.800000000       50        0     0     90.000   ----  KTST ZZ 09 OM',
    '12  12.000000000  -22.000000000       50    11000    25      0.000   ITST  KTST ZZ TEST FIELD DME-ILS',
    '13  11.500000000  -21.500000000      200    11300    40      0.000   TSTD  ENRT ZZ TEST DME',
    '16  12.000000000  -22.000000000       50    00001    40 300090.000   R09   KTST ZZ 09 W09A',
    '17  12.000000000  -22.000000000       50        0     0      0.000   XXXX  KTST ZZ UNKNOWN ROW',
  ]));

  test('reads each row type with its fields as written', () => {
    expect(all.map((n) => n.kind)).toEqual(['ndb', 'vor', 'loc-ils', 'gs', 'om', 'dme-ils', 'dme', 'ltp']);
    expect(all[1]).toEqual({
      code: 3, kind: 'vor', lat: 11.25, lon: -21.75, elevationFt: 100, frequency: 11500, range: 130, value: 5,
      ident: 'TSTB', airport: null, region: 'ZZ', runway: null, name: 'TEST BEACON VORTAC',
    });
    expect(all[2]).toMatchObject({kind: 'loc-ils', airport: 'KTST', runway: '09', name: 'ILS-cat-I', value: 32490});
    expect(all[3]).toMatchObject({kind: 'gs', value: 300090, runway: '09'});
  });

  test('keeps a localizer value of front course × 360 + true bearing as written', () => {
    const [n] = parseNav(file('1200', [' 4  12.0 -22.0 50 11000 25 32490.000 ITST KTST ZZ 09 ILS-cat-I']));
    expect(n!.value).toBe(32490);
    expect(Math.floor(n!.value / 360)).toBe(90);
    expect(n!.value % 360).toBe(90);
  });

  test('an ILS DME has no runway column', () => {
    expect(all[5]).toMatchObject({kind: 'dme-ils', runway: null, name: 'TEST FIELD DME-ILS'});
  });

  test('returns nothing for an unsupported version', () => {
    expect(parseNav(file('1000', [' 2  10.5 -20.25 0 300 50 0.000 TSTA ENRT ZZ TESTVILLE NDB']))).toEqual([]);
  });
});
