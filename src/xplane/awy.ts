// Reader for X-Plane's earth_awy.dat (spec XP AWY1101; real files say 1100, same rows). Based on Kouro's
// reader and its airway stitching, with its agreement. Row: from ident, region, type; to ident, region,
// type; direction (N both ways, F from→to only, B to→from only); layer (1 low, 2 high); base FL; top FL;
// airway names joined by '-'. Never throws: malformed rows are skipped; an unsupported version gives none.
//
// Real files are sorted by the from-ident, not along the airway, so airwayRuns stitches each airway's
// segments (per name and layer) into the longest runs they form, whatever order they are listed in. A
// run ends where the airway ends or branches. A segment listed one-way in each direction is two-way.
// Points are keyed by ident + region. The same airway name in separate places stays separate runs.

import {datRows} from './datfile.ts';

export interface AirwayPoint {
  ident: string;
  region: string;
}

export interface AirwaySegment {
  from: AirwayPoint & {type: number};
  to: AirwayPoint & {type: number};
  direction: 'N' | 'F' | 'B';
  high: boolean;
  baseFl: number;
  topFl: number;
  names: string[];
}

export type SegmentDirection = 'both' | 'forward' | 'backward';

export interface AirwayRun {
  airway: string;
  high: boolean;
  /** In sequence along the run. */
  points: AirwayPoint[];
  /** One per segment, relative to the points' order; absent when every segment is two-way. */
  directions?: SegmentDirection[];
}

const VERSIONS = ['1100', '1101'];
const INT = /^\d+$/;

export function parseAwySegments(text: string): AirwaySegment[] {
  const {version, rows} = datRows(text);
  if (!VERSIONS.includes(version)) return [];
  const out: AirwaySegment[] = [];
  for (const c of rows) {
    if (c.length < 11) continue;
    const [fi, fr, ft, ti, tr, tt, dir, layer, base, top, names] = c as [string, string, string, string, string, string, string, string, string, string, string];
    if ((dir !== 'N' && dir !== 'F' && dir !== 'B') || (layer !== '1' && layer !== '2')) continue;
    if (![ft, tt, base, top].every((x) => INT.test(x))) continue;
    out.push({
      from: {ident: fi, region: fr, type: Number(ft)}, to: {ident: ti, region: tr, type: Number(tt)},
      direction: dir, high: layer === '2', baseFl: Number(base), topFl: Number(top), names: names.split('-'),
    });
  }
  return out;
}

interface Edge { from: string; to: string; oneWay: boolean }

export function airwayRuns(segments: readonly AirwaySegment[]): AirwayRun[] {
  const points = new Map<string, AirwayPoint>();
  const key = (p: AirwayPoint): string => {
    const k = `${p.ident}|${p.region}`;
    if (!points.has(k)) points.set(k, {ident: p.ident, region: p.region});
    return k;
  };
  const groups = new Map<string, {airway: string; high: boolean; edges: Edge[]}>();
  for (const s of segments) {
    const a = key(s.from), b = key(s.to);
    if (a === b) continue;
    for (const airway of s.names) {
      const gk = `${airway}|${s.high}`;
      let g = groups.get(gk);
      if (g === undefined) { g = {airway, high: s.high, edges: []}; groups.set(gk, g); }
      g.edges.push(s.direction === 'B' ? {from: b, to: a, oneWay: true} : {from: a, to: b, oneWay: s.direction === 'F'});
    }
  }
  const runs: AirwayRun[] = [];
  for (const {airway, high, edges} of groups.values()) {
    for (const chain of stitch(edges)) {
      const run: AirwayRun = {airway, high, points: chain.keys.map((k) => points.get(k)!)};
      if (chain.directions.some((d) => d !== 'both')) run.directions = chain.directions;
      runs.push(run);
    }
  }
  return runs;
}

/**
 * Joins segments into chains, ignoring direction for the joining; each segment is used once. Chains start
 * at points with one or more than two segments (ends and branches) and stop at the next such point; what
 * remains are closed loops. (Kouro's stitching.)
 */
function stitch(segments: readonly Edge[]): Array<{keys: string[]; directions: SegmentDirection[]}> {
  const edgesAt = new Map<string, number[]>();
  const byKey = new Map<string, Edge>();
  const edges: Edge[] = [];
  for (const seg of segments) {
    const k = seg.from < seg.to ? `${seg.from}\u0000${seg.to}` : `${seg.to}\u0000${seg.from}`;
    const known = byKey.get(k);
    if (known !== undefined) {
      // Listed again: two-way unless both listings are one-way in the same direction.
      if (!seg.oneWay || seg.from !== known.from) known.oneWay = false;
      continue;
    }
    const edge = {...seg};
    byKey.set(k, edge);
    const index = edges.push(edge) - 1;
    for (const p of [edge.from, edge.to]) {
      const list = edgesAt.get(p);
      if (list) list.push(index); else edgesAt.set(p, [index]);
    }
  }
  const used = new Set<number>();
  const degree = (p: string): number => edgesAt.get(p)?.length ?? 0;
  const walk = (start: string): {keys: string[]; directions: SegmentDirection[]} => {
    const chain = {keys: [start], directions: [] as SegmentDirection[]};
    let at = start;
    for (;;) {
      const next = edgesAt.get(at)?.find((e) => !used.has(e));
      if (next === undefined) break;
      used.add(next);
      const edge = edges[next]!;
      const forward = edge.from === at;
      chain.directions.push(!edge.oneWay ? 'both' : forward ? 'forward' : 'backward');
      at = forward ? edge.to : edge.from;
      chain.keys.push(at);
      if (degree(at) !== 2) break;
    }
    return chain;
  };
  const chains: Array<{keys: string[]; directions: SegmentDirection[]}> = [];
  const collect = (start: string): void => {
    for (;;) {
      const chain = walk(start);
      if (chain.keys.length < 2) break;
      chains.push(chain);
    }
  };
  for (const p of edgesAt.keys()) if (degree(p) !== 2) collect(p);
  for (const p of edgesAt.keys()) collect(p);
  return chains;
}
