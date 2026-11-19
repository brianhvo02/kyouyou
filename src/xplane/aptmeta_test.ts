import {describe, expect, test} from 'vitest';
import {parseAptMeta} from './aptmeta.ts';

// Made-up lines in the layout of X-Plane's earth_aptmeta.dat. Nothing here is copied from real data.
const header = 'I\n1210 Version - made-up test header\n\n';

describe('parseAptMeta', () => {
  test('reads an airport with a transition altitude and a flight-level transition level', () => {
    const m = parseAptMeta(`${header}KTST K2  37.500000000 -122.250000000    13 C 11000 I 18000 FL180\n99\n`);
    expect(m.get('KTST')).toEqual({
      region: 'K2', lat: 37.5, lon: -122.25, elevationFt: 13, use: 'C', longestRunwayFt: 11000,
      transitionAltitudeFt: 18000, transitionLevelFt: 18000,
    });
  });

  test('reads a transition level in feet, and -1 as none', () => {
    const m = parseAptMeta(`${header}ZTST ZZ  40.000000000  120.000000000   622 J  8500 I  9490 11800\nXTST XX   1.000000000   -2.000000000   -40 P  2000 0    -1 -1\n`);
    expect(m.get('ZTST')).toMatchObject({use: 'J', transitionAltitudeFt: 9490, transitionLevelFt: 11800});
    expect(m.get('XTST')).toMatchObject({elevationFt: -40, use: 'P', transitionAltitudeFt: null, transitionLevelFt: null});
  });

  test('skips the header, the end marker and malformed lines', () => {
    const m = parseAptMeta(`${header}KTST K2 not-a-number -122.25 13 C 11000 I 18000 FL180\n99\n`);
    expect(m.size).toBe(0);
  });
});
