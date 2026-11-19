// Reader for X-Plane's earth_hold.dat (spec XP HOLD1140): published holds not part of a terminal
// procedure. Row: ident, region, terminal airport or ENRT, fix type (11 fix, 2 NDB, 3 VHF navaid),
// inbound course (magnetic), leg time (min, 0 for a DME hold), DME leg length (NM, 0 for a timed hold),
// turn L or R, minimum altitude, maximum altitude, speed limit (ft, ft, kt; 0 when none). A course of
// 360° is written 0 (kept as written). Never throws:
// malformed rows are skipped; an unsupported version gives none.

import {datRows} from './datfile.ts';

export interface Hold {
  ident: string;
  region: string;
  /** The airport a terminal hold belongs to; null for ENRT. */
  airport: string | null;
  fixType: number;
  inboundCourseDeg: number;
  legTimeMin: number | null;
  legDistanceNm: number | null;
  turn: 'L' | 'R';
  minAltFt: number | null;
  maxAltFt: number | null;
  speedKt: number | null;
}

const NUM = /^\d+(\.\d+)?$/;
const orNull = (v: number): number | null => (v === 0 ? null : v);

export function parseHolds(text: string): Hold[] {
  const {version, rows} = datRows(text);
  if (version !== '1140') return [];
  const out: Hold[] = [];
  for (const c of rows) {
    if (c.length < 11) continue;
    const [ident, region, apt, type, crs, time, dist, turn, min, max, spd] = c as [string, string, string, string, string, string, string, string, string, string, string];
    if (turn !== 'L' && turn !== 'R') continue;
    if (![type, crs, time, dist, min, max, spd].every((x) => NUM.test(x))) continue;
    out.push({
      ident, region, airport: apt === 'ENRT' ? null : apt, fixType: Number(type), inboundCourseDeg: Number(crs),
      legTimeMin: orNull(Number(time)), legDistanceNm: orNull(Number(dist)), turn,
      minAltFt: orNull(Number(min)), maxAltFt: orNull(Number(max)), speedKt: orNull(Number(spd)),
    });
  }
  return out;
}
