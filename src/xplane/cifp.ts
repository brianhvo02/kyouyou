// Reader for X-Plane's per-airport procedure files (CIFP/$ICAO.dat, spec XP CIFP1101 / XP CIFP1250).
// Model-neutral: it keeps approaches, altitude limits, speed limits and path terminators, and leaves
// resolving fixes and choosing a data model to the caller.
//
// Each line is `ROWCODE:field,field,...;` with optional further `;` groups. Handled row codes are
// SID, STAR, APPCH (legs) and RWY. Anything else (PRDAT and so on) is ignored. An optional
// `I` / `<version> Version` header is skipped.

import {makeLeg, parseElevation, parseFeet, parseLat, parseLon, procedureCollector} from '../arinc424/procedures.ts';

export interface CifpAlt {
  kind: 'at' | 'at-or-above' | 'at-or-below' | 'between';
  ft: number;
  lowerFt?: number;
  /** Descriptions G and H: the glide slope altitude at this fix (the second altitude). */
  glideSlopeFt?: number;
  /** Descriptions I and J: the glide slope intercept altitude (the second altitude). */
  glideSlopeInterceptFt?: number;
}

export type FixRole = 'IAF' | 'IF' | 'FAF' | 'MAP' | null;

export interface CifpLeg {
  seq: number;
  fix: string;
  region: string;
  pathTerm: string;
  alt: CifpAlt | null;
  speedKt: number | null;
  courseDeg: number | null;
  /** The course is true, not magnetic: written `dddT` in whole degrees (used at high latitudes). */
  courseTrue: boolean;
  /** Field 8 as written, e.g. 'EE B'. */
  descriptor: string;
  /** From descriptor position 4: A, C, D -> IAF; B -> IF; F -> FAF; M -> MAP; else null. */
  role: FixRole;
  /** Descriptor position 2 is 'Y'. */
  flyOver: boolean;
  /** Approaches: true from the first leg whose descriptor position 3 is 'M' to the end of the route. */
  missed: boolean;
  /** Turn direction as written (L, R, or E for either), or null. RF and AF legs and holds carry one. */
  turnDirection: 'L' | 'R' | 'E' | null;
  /** The recommended navaid, by ident and ICAO region (AF legs, and legs that end at a DME or radial). */
  recommendedNavaid: {ident: string; region: string} | null;
  /** RF legs: the arc radius, NM. */
  arcRadiusNm: number | null;
  /** Magnetic bearing from the recommended navaid, degrees. */
  thetaDeg: number | null;
  /** Distance from the recommended navaid, NM. */
  rhoNm: number | null;
  /** The route distance as written (leg or arc length, DME distance, or holding leg length), NM. */
  routeDistanceNm: number | null;
  /** Holds written with a time instead of a distance, minutes. Never set together with routeDistanceNm. */
  holdTimeMin: number | null;
  /** The vertical (glide path) angle, degrees, e.g. -3. */
  verticalAngleDeg: number | null;
  /** RF legs only: the arc centre fix, by ident and ICAO region (null on every other leg). */
  arcCentre: {ident: string; region: string} | null;
}

export interface CifpRoute {
  name: string;
  /** Field 1 as written (ARINC 424 route type). */
  routeType: string;
  legs: CifpLeg[];
}

export interface CifpProcedure {
  kind: 'sid' | 'star' | 'approach';
  name: string;
  routes: CifpRoute[];
  /** Approaches only, from the name: I -> ILS, L -> LOC, R -> RNAV, H -> RNP, else other; runway '24R' from 'I24R'/'R06LY'; variant 'Y'. */
  approachType?: 'ILS' | 'LOC' | 'RNAV' | 'RNP' | 'other';
  runway?: string;
  variant?: string;
}

export interface CifpRunway {
  ident: string;
  lat: number;
  lon: number;
  /** Landing threshold elevation, RWY field 3. */
  elevationFt: number | null;
}

export interface CifpSkipped {
  line: number;
  reason: string;
}

export interface CifpAirport {
  runways: CifpRunway[];
  procedures: CifpProcedure[];
  transitionAltitudeFt: number | null;
  skipped: CifpSkipped[];
}

type Kind = CifpProcedure['kind'];

const ROW_KINDS: Readonly<Record<string, Kind>> = {SID: 'sid', STAR: 'star', APPCH: 'approach'};

/** Never throws. Rows it cannot read are skipped. */
export function parseCifp(text: string): CifpAirport {
  const runways: CifpRunway[] = [];
  const skipped: CifpSkipped[] = [];
  const procedures = procedureCollector();
  let transitionAltitudeFt: number | null = null;

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.trim();
    if (line === '') return;
    if (/^[IA]$/.test(line) || /^\d+\s+Version\b/.test(line)) return;
    const colon = line.indexOf(':');
    if (colon < 0) {
      skipped.push({line: lineNo, reason: 'no row code'});
      return;
    }
    const code = line.slice(0, colon);
    const groups = line.slice(colon + 1).split(';');
    const rawFields = (groups[0] ?? '').split(',');
    const f = rawFields.map((s) => s.trim());

    if (code === 'RWY') {
      const lat = parseLat(((groups[1] ?? '').split(',')[0] ?? '').trim());
      const lon = parseLon(((groups[1] ?? '').split(',')[1] ?? '').trim());
      const ident = (f[0] ?? '').replace(/^RW/, '');
      if (ident === '' || lat === undefined || lon === undefined) {
        skipped.push({line: lineNo, reason: 'RWY row without a readable runway or threshold position'});
        return;
      }
      runways.push({ident, lat, lon, elevationFt: parseElevation(f[3] ?? '')});
      return;
    }

    const kind = ROW_KINDS[code];
    if (kind === undefined) return;
    const seq = /^\d+$/.test(f[0] ?? '') ? Number(f[0]) : NaN;
    const name = f[2] ?? '';
    if (f.length < 12 || name === '' || !Number.isFinite(seq)) {
      skipped.push({line: lineNo, reason: `malformed ${code} row`});
      return;
    }

    if (transitionAltitudeFt === null) transitionAltitudeFt = parseFeet(f[25] ?? '');

    const leg = makeLeg({
      seq,
      fix: f[4] ?? '',
      region: f[5] ?? '',
      pathTerm: f[11] ?? '',
      // Not trimmed: the leading spaces of '  M ' are positions.
      descriptor: rawFields[8] ?? '',
      altDesc: f[22] ?? '',
      alt1: f[23] ?? '',
      alt2: f[24] ?? '',
      course: f[20] ?? '',
      speed: f[27] ?? '',
      turn: f[9] ?? '',
      navaid: f[13] ?? '',
      navaidRegion: f[14] ?? '',
      arcRadius: f[17] ?? '',
      theta: f[18] ?? '',
      rho: f[19] ?? '',
      distance: f[21] ?? '',
      verticalAngle: f[28] ?? '',
      centre: f[30] ?? '',
      centreRegion: f[31] ?? '',
    });
    procedures.add(kind, name, f[1] ?? '', f[3] ?? '', leg);
  });

  return {runways, procedures: procedures.finish(), transitionAltitudeFt, skipped};
}
