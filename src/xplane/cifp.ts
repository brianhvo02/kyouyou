// Reader for X-Plane's per-airport procedure files (CIFP/$ICAO.dat, spec XP CIFP1101 / XP CIFP1250).
// Model-neutral: it keeps approaches, altitude limits, speed limits and path terminators, and leaves
// resolving fixes and choosing a data model to the caller.
//
// Each line is `ROWCODE:field,field,...;` with optional further `;` groups. Handled row codes are
// SID, STAR, APPCH (legs) and RWY. Anything else (PRDAT and so on) is ignored. An optional
// `I` / `<version> Version` header is skipped.

export interface CifpAlt {
  kind: 'at' | 'at-or-above' | 'at-or-below' | 'between';
  ft: number;
  lowerFt?: number;
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
  /** Field 8 as written, e.g. 'EE B'. */
  descriptor: string;
  /** From descriptor position 4: A, C, D -> IAF; B -> IF; F -> FAF; M -> MAP; else null. */
  role: FixRole;
  /** Descriptor position 2 is 'Y'. */
  flyOver: boolean;
  /** Approaches: true from the first leg whose descriptor position 3 is 'M' to the end of the route. */
  missed: boolean;
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
  const procs = new Map<string, {proc: CifpProcedure; routes: Map<string, CifpRoute>}>();
  let transitionAltitudeFt: number | null = null;
  const missedMarks = new Map<CifpLeg, boolean>();

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
      runways.push({ident, lat, lon, elevationFt: /^-?\d+$/.test(f[3] ?? '') ? Number(f[3]) : null});
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

    // Not trimmed: the leading spaces of '  M ' are positions.
    const descriptor = rawFields[8] ?? '';
    const d = descriptor.padEnd(4);
    const course = /^\d+$/.test(f[20] ?? '') ? Number(f[20]) / 10 : null;
    const speed = /^\d+$/.test(f[27] ?? '') ? Number(f[27]) : null;
    const leg: CifpLeg = {
      seq,
      fix: f[4] ?? '',
      region: f[5] ?? '',
      pathTerm: f[11] ?? '',
      alt: parseAlt(f[22] ?? '', f[23] ?? '', f[24] ?? ''),
      speedKt: speed,
      courseDeg: course,
      descriptor,
      role: roleOf(d[3] ?? ' '),
      flyOver: d[1] === 'Y',
      missed: false,
    };

    const key = `${kind}\u0000${name}`;
    let entry = procs.get(key);
    if (entry === undefined) {
      entry = {proc: {kind, name, routes: []}, routes: new Map()};
      if (kind === 'approach') Object.assign(entry.proc, approachInfo(name));
      procs.set(key, entry);
    }
    const routeName = f[3] ?? '';
    const routeType = f[1] ?? '';
    const routeKey = `${routeType}\u0000${routeName}`;
    let route = entry.routes.get(routeKey);
    if (route === undefined) {
      route = {name: routeName, routeType, legs: []};
      entry.routes.set(routeKey, route);
      entry.proc.routes.push(route);
    }
    route.legs.push(leg);
    // Kept until the route is sorted, below.
    missedMarks.set(leg, d[2] === 'M');
  });

  const procedures: CifpProcedure[] = [];
  for (const {proc} of procs.values()) {
    for (const route of proc.routes) {
      route.legs.sort((a, b) => a.seq - b.seq);
      let missed = false;
      for (const leg of route.legs) {
        if (proc.kind === 'approach' && missedMarks.get(leg) === true) missed = true;
        leg.missed = missed;
      }
    }
    procedures.push(proc);
  }
  return {runways, procedures, transitionAltitudeFt, skipped};
}

function roleOf(c: string): FixRole {
  if (c === 'A' || c === 'C' || c === 'D') return 'IAF';
  if (c === 'B') return 'IF';
  if (c === 'F') return 'FAF';
  if (c === 'M') return 'MAP';
  return null;
}

function approachInfo(name: string): Pick<CifpProcedure, 'approachType' | 'runway' | 'variant'> {
  const type = ({I: 'ILS', L: 'LOC', R: 'RNAV', H: 'RNP'} as const)[name[0] as 'I' | 'L' | 'R' | 'H'] ?? 'other';
  const m = /^[A-Z](\d{2}[LRC]?)([A-Z]?)$/.exec(name);
  const info: Pick<CifpProcedure, 'approachType' | 'runway' | 'variant'> = {approachType: type};
  if (m !== null) {
    info.runway = m[1];
    if (m[2] !== '') info.variant = m[2];
  }
  return info;
}

/** Feet, or `FL240` (24,000). Anything else is null. */
function parseFeet(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  const fl = /^FL(\d+)$/.exec(s);
  return fl === null ? null : Number(fl[1]) * 100;
}

function parseAlt(desc: string, a1: string, a2: string): CifpAlt | null {
  const first = parseFeet(a1);
  const second = parseFeet(a2);
  if (desc === '') desc = ' ';
  switch (desc) {
    case ' ': case '@': case 'X': case 'G': case 'I':
      return first === null ? null : {kind: 'at', ft: first};
    case '+': case 'H': case 'J': case 'V':
      return first === null ? null : {kind: 'at-or-above', ft: first};
    case 'C':
      return second === null ? null : {kind: 'at-or-above', ft: second};
    case '-': case 'Y':
      return first === null ? null : {kind: 'at-or-below', ft: first};
    case 'B':
      if (first === null) return null;
      return second === null ? {kind: 'between', ft: first} : {kind: 'between', ft: first, lowerFt: second};
    default:
      return null;
  }
}

/** ARINC 424 packed latitude `N/S DD MM SS ss` (9 chars). */
function parseLat(s: string): number | undefined {
  if (!/^[NS]\d{8}$/.test(s)) return undefined;
  const v = Number(s.slice(1, 3)) + Number(s.slice(3, 5)) / 60 + (Number(s.slice(5, 7)) + Number(s.slice(7, 9)) / 100) / 3600;
  return s[0] === 'S' ? -v : v;
}

/** ARINC 424 packed longitude `E/W DDD MM SS ss` (10 chars). */
function parseLon(s: string): number | undefined {
  if (!/^[EW]\d{9}$/.test(s)) return undefined;
  const v = Number(s.slice(1, 4)) + Number(s.slice(4, 6)) / 60 + (Number(s.slice(6, 8)) + Number(s.slice(8, 10)) / 100) / 3600;
  return s[0] === 'W' ? -v : v;
}
