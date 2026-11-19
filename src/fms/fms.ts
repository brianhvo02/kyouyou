// X-Plane's v1100 `.fms` flight plan: reading one, and writing one. Kouro writes them, Kōkūzu and
// Kansei read them, so both ends live here and a round-trip test holds them together.

export type FmsPointKind = 'airport' | 'ndb' | 'vor' | 'fix';

export interface FmsPoint {
  ident: string;
  kind: FmsPointKind;
  lat: number;
  lon: number;
  /** How the point is reached: an airway name, DRCT, or ADEP / ADES for the two airports. */
  via: string;
  /** The altitude on the point's line, feet. Kouro writes 0 for the airports and the initial cruise altitude en route. */
  altitudeFt: number;
}

export interface FmsProcedure {
  name: string;
  /** Without the RW prefix: "28R". */
  runway?: string;
  transition?: string;
}

export interface FmsApproach {
  name: string;
  transition?: string;
}

export interface FmsPlan {
  origin: string;
  dest: string;
  cycle?: string;
  /** The runways, without the RW prefix, whether or not a procedure is named with them. */
  departureRunway?: string;
  arrivalRunway?: string;
  sid?: FmsProcedure;
  star?: FmsProcedure;
  /** X-Plane's own FMS writes the approach, and `writeFms` does in named mode. */
  approach?: FmsApproach;
  points: FmsPoint[];
  /** The airports among the points, each once, in order. */
  airports: string[];
  /** The highest altitude on any point, when one is above zero: the plan's initial cruise altitude. */
  cruiseAltitudeFt?: number;
}

const KINDS: Record<string, FmsPointKind> = { '1': 'airport', '2': 'ndb', '3': 'vor', '11': 'fix' };
const TYPE_CODE: Record<FmsPointKind, number> = { airport: 1, ndb: 2, vor: 3, fix: 11 };

/** A `.fms` file's text as a plan, or why it is not one. Never throws. */
export function parseFms(text: string): FmsPlan | { error: string } {
  try {
    return parse(text);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not parse flight plan' };
  }
}

function parse(text: string): FmsPlan | { error: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length < 3 || lines[0] !== 'I' || !/^1100\s+Version$/i.test(lines[1] ?? '')) {
    return { error: 'Not an X-Plane .fms flight plan (v1100)' };
  }

  const head: Record<string, string> = {};
  let count = -1;
  let i = 2;
  for (; i < lines.length; i++) {
    // Header lines are a keyword and the rest of the line. Keywords this does not know are skipped.
    const line = lines[i] ?? '';
    const m = /^(\S+)\s+(.+)$/.exec(line);
    if (!m) return { error: `Malformed header line: ${line}` };
    const key = m[1] ?? '';
    const value = m[2] ?? '';
    if (key === 'NUMENR') {
      if (!/^\d+$/.test(value)) return { error: 'Invalid NUMENR' };
      count = Number(value);
      i++;
      break;
    }
    head[key] = value;
  }
  if (count < 0) return { error: 'Missing NUMENR' };
  // ADEP and ADES come from the header and are deliberately not checked against the first and last point.
  const origin = head['ADEP'];
  const dest = head['ADES'];
  if (!origin || !dest) return { error: 'Missing ADEP or ADES' };

  const wp = lines.slice(i);
  if (wp.length !== count) return { error: `NUMENR says ${count} waypoints but found ${wp.length}` };
  if (count < 2) return { error: 'A flight plan needs at least an origin and a destination' };

  const points: FmsPoint[] = [];
  for (const line of wp) {
    const f = line.split(/\s+/);
    if (f.length !== 6) return { error: `Malformed waypoint line: ${line}` };
    // A type code this does not know is rejected: the point could not be placed as one of the four kinds.
    const kind = KINDS[f[0] ?? ''];
    const altitudeFt = Number(f[3]);
    const lat = Number(f[4]);
    const lon = Number(f[5]);
    if (!kind || !Number.isFinite(altitudeFt) || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return { error: `Malformed waypoint line: ${line}` };
    }
    points.push({ ident: f[1] ?? '', kind, lat, lon, via: f[2] ?? '', altitudeFt });
  }

  const airports: string[] = [];
  for (const p of points) if (p.kind === 'airport' && !airports.includes(p.ident)) airports.push(p.ident);

  // The RW prefix is taken off runways (RW28R is 28R).
  const departureRunway = head['DEPRWY']?.replace(/^RW/, '');
  const arrivalRunway = head['DESRWY']?.replace(/^RW/, '');
  const plan: FmsPlan = { origin, dest, points, airports };
  if (head['CYCLE'] !== undefined) plan.cycle = head['CYCLE'];
  if (departureRunway) plan.departureRunway = departureRunway;
  if (arrivalRunway) plan.arrivalRunway = arrivalRunway;
  if (head['SID']) plan.sid = procedure(head['SID'], departureRunway, head['SIDTRANS']);
  if (head['STAR']) plan.star = procedure(head['STAR'], arrivalRunway, head['STARTRANS']);
  if (head['APP']) {
    plan.approach = { name: head['APP'] };
    if (head['APPTRANS']) plan.approach.transition = head['APPTRANS'];
  }
  const cruise = Math.max(0, ...points.map((p) => p.altitudeFt));
  if (cruise > 0) plan.cruiseAltitudeFt = cruise;
  return plan;
}

function procedure(name: string, runway: string | undefined, transition: string | undefined): FmsProcedure {
  const p: FmsProcedure = { name };
  if (runway) p.runway = runway;
  if (transition) p.transition = transition;
  return p;
}

/** A place on the route as the writer takes it. */
export interface FmsWritePoint {
  ident: string;
  kind: FmsPointKind;
  lat: number;
  lon: number;
}

export interface FmsWriteLeg extends FmsWritePoint {
  /** An airway name, DCT (or DRCT) for direct, or the name of the SID or STAR the leg belongs to. */
  via: string;
}

export interface FmsWritePlan {
  cycle: string;
  origin: FmsWritePoint;
  dest: FmsWritePoint;
  sid?: FmsProcedure;
  star?: FmsProcedure;
  /** Named mode only: written as APP (and APPTRANS) after the STAR lines, where X-Plane's own FMS puts them. */
  approach?: FmsApproach;
  /** Written on every en-route point; the airports get 0. There are no step climbs in the format. */
  cruiseAltitudeFt: number;
  /** Every leg between the airports, the procedures' legs included. */
  legs: readonly FmsWriteLeg[];
}

/**
 * `named` writes a SID or STAR as header lines and leaves its legs out (the FMC expands them), but only
 * when its runway is known, since X-Plane ignores a procedure without a runway; otherwise its legs are
 * written as direct waypoints. `waypoints` lists every leg, the procedures' as direct.
 */
export type FmsMode = 'named' | 'waypoints';

function withRw(runway: string): string {
  const r = runway.trim().toUpperCase();
  return r.startsWith('RW') ? r : `RW${r}`;
}

function pointLine(p: FmsWritePoint, via: string, altitudeFt: number): string {
  return `${TYPE_CODE[p.kind]} ${p.ident} ${via} ${altitudeFt.toFixed(6)} ${p.lat.toFixed(6)} ${p.lon.toFixed(6)}`;
}

/** The plan as the text of an X-Plane 11/12 `.fms` file (v1100). Every line ends with a newline. */
export function writeFms(plan: FmsWritePlan, mode: FmsMode): string {
  const named = mode === 'named';
  const sidName = plan.sid?.name;
  const starName = plan.star?.name;
  const isProcedure = (via: string): boolean => via === sidName || via === starName;
  const sidRunway = named ? plan.sid?.runway : undefined;
  const starRunway = named ? plan.star?.runway : undefined;
  const expandedBySim = (via: string): boolean => (sidRunway !== undefined && via === sidName) || (starRunway !== undefined && via === starName);

  const header: string[] = ['I', '1100 Version', `CYCLE ${plan.cycle}`, `ADEP ${plan.origin.ident}`];
  if (plan.sid && sidRunway !== undefined) {
    header.push(`DEPRWY ${withRw(sidRunway)}`, `SID ${plan.sid.name}`);
    if (plan.sid.transition !== undefined) header.push(`SIDTRANS ${plan.sid.transition}`);
  }
  header.push(`ADES ${plan.dest.ident}`);
  if (plan.star && starRunway !== undefined) {
    header.push(`DESRWY ${withRw(starRunway)}`, `STAR ${plan.star.name}`);
    if (plan.star.transition !== undefined) header.push(`STARTRANS ${plan.star.transition}`);
  }
  if (named && plan.approach) {
    header.push(`APP ${plan.approach.name}`);
    if (plan.approach.transition !== undefined) header.push(`APPTRANS ${plan.approach.transition}`);
  }

  const lines: string[] = [pointLine(plan.origin, 'ADEP', 0)];
  for (const leg of plan.legs) {
    if (expandedBySim(leg.via)) continue;
    const via = leg.via === 'DCT' || leg.via === 'DRCT' || isProcedure(leg.via) ? 'DRCT' : leg.via;
    lines.push(pointLine(leg, via, plan.cruiseAltitudeFt));
  }
  lines.push(pointLine(plan.dest, 'ADES', 0));

  return [...header, `NUMENR ${lines.length}`, ...lines].map((l) => `${l}\n`).join('');
}
