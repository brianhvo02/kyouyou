import {describe, expect, test} from 'vitest';
import {moraAt, parseMora} from './mora.ts';

// Made-up grid MORA rows in the layout of X-Plane's earth_mora.dat. Nothing here is copied from real data.
const file = (rows: string[], version = '1150') => ['I', `${version} Version - made-up`, '', ...rows, '99', ''].join('\n');
const row = (lat: string, lon: string, first: number) => `${lat} ${lon} ${Array.from({length: 30}, (_, i) => String(first + i).padStart(3, '0')).join(' ')}`;

describe('parseMora and moraAt', () => {
  const grid = parseMora(file([row('+47', '+000', 10), row('-34', '-071', 50)]));

  test('looks up a cell by its lower-left corner, in feet', () => {
    expect(moraAt(grid, 47.5, 0.5)).toBe(1000);
    expect(moraAt(grid, 47.5, 29.5)).toBe(3900);
    expect(moraAt(grid, -33.5, -70.5)).toBe(5000);
    expect(moraAt(grid, -33.5, -42.5)).toBe(7800);
  });

  test('returns null for a cell with no row', () => {
    expect(moraAt(grid, 10, 10)).toBeNull();
  });

  test('reads nothing for another version', () => {
    expect(moraAt(parseMora(file([row('+47', '+000', 10)], '1140')), 47.5, 0.5)).toBeNull();
  });
});
