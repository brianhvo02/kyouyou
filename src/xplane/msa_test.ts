import {describe, expect, test} from 'vitest';
import {parseMsa} from './msa.ts';

// Made-up MSAs in the layout of X-Plane's earth_msa.dat. Nothing here is copied from real data.
const file = (rows: string[], version = '1150') => ['I', `${version} Version - made-up`, '', ...rows, '99', ''].join('\n');

describe('parseMsa', () => {
  test('reads one sector, with altitude in hundreds of feet', () => {
    expect(parseMsa(file(['11 TSTAA ZZ KTST M 180 025 25 000 000 0']))).toEqual([
      {pointType: 11, ident: 'TSTAA', region: 'ZZ', airport: 'KTST', bearingRef: 'M', sectors: [{bearingDeg: 180, altitudeFt: 2500, radiusNm: 25}]},
    ]);
  });

  test('reads seven sectors and a true reference', () => {
    const s = Array.from({length: 7}, (_, i) => `${String(i * 50).padStart(3, '0')} 0${30 + i} 25`).join(' ');
    const [m] = parseMsa(file([`3 TSTB ZZ KTST T ${s} 000 000 0`]));
    expect(m!.bearingRef).toBe('T');
    expect(m!.sectors).toHaveLength(7);
    expect(m!.sectors[6]).toEqual({bearingDeg: 300, altitudeFt: 3600, radiusNm: 25});
  });

  test('skips a row without sectors or with a bad reference, and returns nothing for another version', () => {
    expect(parseMsa(file(['11 TSTAA ZZ KTST M 000 000 0', '11 TSTAA ZZ KTST X 180 025 25 000 000 0']))).toEqual([]);
    expect(parseMsa(file(['11 TSTAA ZZ KTST M 180 025 25 000 000 0'], '1140'))).toEqual([]);
  });
});
