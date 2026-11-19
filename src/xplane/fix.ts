// Reader for X-Plane's earth_fix.dat (specs XP FIX1101 and XP FIX1200). Based on Kouro's reader, with
// its agreement. Row: lat, lon, ident, terminal airport or ENRT, ICAO region, and in 1200 the waypoint
// type (an integer) and a name. Never throws: malformed rows are skipped; an unsupported version gives
// no fixes. Fixes are keyed by ident + region (the same ident is reused in other regions).

import {datRows} from './datfile.ts';

export interface Fix {
  ident: string;
  region: string;
  /** The airport a terminal fix belongs to; null for an enroute fix (ENRT). */
  airport: string | null;
  lat: number;
  lon: number;
  /** FIX1200's waypoint type, as written; null in 1101 or when absent. */
  type: number | null;
  /** FIX1200's name; null in 1101 or when absent. */
  name: string | null;
}

const VERSIONS = ['1101', '1200'];

export function parseFix(text: string): Fix[] {
  const {version, rows} = datRows(text);
  if (!VERSIONS.includes(version)) return [];
  const out: Fix[] = [];
  for (const c of rows) {
    if (c.length < 5) continue;
    const lat = Number(c[0]), lon = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const type = c[5] !== undefined && /^\d+$/.test(c[5]) ? Number(c[5]) : null;
    out.push({
      ident: c[2]!, region: c[4]!, airport: c[3] === 'ENRT' ? null : c[3]!, lat, lon, type,
      name: c.length > 6 ? c.slice(6).join(' ') : null,
    });
  }
  return out;
}
