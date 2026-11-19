// Reader for X-Plane's earth_mora.dat (spec XP MORA1150): grid minimum off-route altitudes, one per
// 1°×1° cell, named by its lower-left corner (cell +4 -150 covers N04–N05, W150–W149). Row: latitude,
// longitude of the first cell, then 30 values (hundreds of ft) for 30 cells eastward. Never throws:
// malformed rows are skipped; an unsupported version gives an empty grid.

import {datRows} from './datfile.ts';

export interface MoraGrid {
  /** MORA in feet for the cell whose lower-left corner is (latDeg, lonDeg); null when the file has none. */
  get(latDeg: number, lonDeg: number): number | null;
}

const SIGNED = /^[+-]?\d+$/;

export function parseMora(text: string): MoraGrid {
  const cells = new Map<string, number>();
  const {version, rows} = datRows(text);
  if (version === '1150') {
    for (const c of rows) {
      if (c.length !== 32 || !SIGNED.test(c[0]!) || !SIGNED.test(c[1]!)) continue;
      const lat = Number(c[0]), lon0 = Number(c[1]);
      if (!c.slice(2).every((v) => /^\d+$/.test(v))) continue;
      for (let i = 0; i < 30; i++) cells.set(`${lat},${lon0 + i}`, Number(c[2 + i]) * 100);
    }
  }
  return {get: (latDeg, lonDeg) => cells.get(`${latDeg},${lonDeg}`) ?? null};
}

/** MORA in feet at a position (the cell containing it), or null. */
export function moraAt(grid: MoraGrid, lat: number, lon: number): number | null {
  return grid.get(Math.floor(lat), Math.floor(lon));
}
