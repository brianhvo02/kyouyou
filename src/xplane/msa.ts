// Reader for X-Plane's earth_msa.dat (spec XP MSA1150): published minimum sector altitudes. Row: point
// type (11 fix, 2 NDB, 3 VHF navaid, 1 airport reference point, 10 runway threshold), ident, region,
// airport (the same point can have different MSAs per airport), bearing reference M or T, then up to
// seven sectors of bearing (deg), altitude (hundreds of ft) and radius (NM), ended by `000 000 0`.
// A sector's altitude applies from the previous sector's bearing, clockwise, to its own bearing, measured
// outward from the fix (Kōkūzu checked this against terrain; the alternatives fit far fewer MSAs). Each
// sector's bearing is as ARINC 424 publishes it (field 5.146), except that X-Plane writes 360° as 0 (kept as written). Never throws: malformed rows are skipped;
// an unsupported version gives none. Sectors with a 0 altitude or 0 radius are left out, and a row left
// with no sectors is skipped.

import {datRows} from './datfile.ts';

export interface MsaSector {
  bearingDeg: number;
  altitudeFt: number;
  radiusNm: number;
}

export interface Msa {
  pointType: number;
  ident: string;
  region: string;
  airport: string;
  bearingRef: 'M' | 'T';
  sectors: MsaSector[];
}

const INT = /^\d+$/;

export function parseMsa(text: string): Msa[] {
  const {version, rows} = datRows(text);
  if (version !== '1150') return [];
  const out: Msa[] = [];
  for (const c of rows) {
    if (c.length < 8 || !INT.test(c[0]!)) continue;
    const ref = c[4];
    if (ref !== 'M' && ref !== 'T') continue;
    const sectors: MsaSector[] = [];
    let ok = true;
    for (let i = 5; i + 2 < c.length && sectors.length < 7; i += 3) {
      const [b, a, r] = [c[i]!, c[i + 1]!, c[i + 2]!];
      if (!INT.test(b) || !INT.test(a) || !INT.test(r)) { ok = false; break; }
      if (Number(b) === 0 && Number(a) === 0 && Number(r) === 0) break;
      // A sector with no altitude or no radius is not a usable MSA (real files have a few); leave it out.
      if (Number(a) === 0 || Number(r) === 0) continue;
      sectors.push({bearingDeg: Number(b), altitudeFt: Number(a) * 100, radiusNm: Number(r)});
    }
    if (!ok || sectors.length === 0) continue;
    out.push({pointType: Number(c[0]), ident: c[1]!, region: c[2]!, airport: c[3]!, bearingRef: ref, sectors});
  }
  return out;
}
