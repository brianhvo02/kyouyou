// Reader for X-Plane's airspaces/airspace.txt (in Custom Data): airspace areas in a small subset of the
// OpenAir format. As found in X-Plane 12 data, each area is
//
//   AC <class>            A–G, CTR, R (restricted), Q (danger), P (prohibited), …
//   AN <name>
//   AL <floor>            GND, or <feet> MSL
//   AH <ceiling>
//   DP DD:MM:SS N DDD:MM:SS W     one per corner, at least three
//
// with no arcs or circles. Anything else is skipped, never thrown on; an area with no class, an unreadable
// limit, an unreadable corner or fewer than three corners is left out. Keywords may be followed by any
// whitespace.

import {pointInPolygon} from '../geo/polygon.ts';
import type {LatLon} from '../geo/polygon.ts';

export interface AirspaceLimit {
  ft: number;
  ref: 'MSL' | 'GND';
}

export interface Airspace {
  /** As written after AC: A–G, CTR, R, Q, P, … */
  class: string;
  name: string;
  floor: AirspaceLimit;
  ceiling: AirspaceLimit;
  /** Corners in file order; the first is not repeated at the end. */
  ring: LatLon[];
}

interface Draft {
  class: string;
  name: string;
  floor: AirspaceLimit | null | undefined;
  ceiling: AirspaceLimit | null | undefined;
  ring: LatLon[];
  bad: boolean;
}

function parseLimit(s: string): AirspaceLimit | null {
  if (s === 'GND') return {ft: 0, ref: 'GND'};
  const m = /^(-?\d+) MSL$/.exec(s);
  return m === null ? null : {ft: Number(m[1]), ref: 'MSL'};
}

const DP = /^(\d{1,2}):(\d{2}):(\d{2}) ([NS]) (\d{1,3}):(\d{2}):(\d{2}) ([EW])$/;

function parsePoint(s: string): LatLon | null {
  const m = DP.exec(s);
  if (m === null) return null;
  const lat = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
  const lon = Number(m[5]) + Number(m[6]) / 60 + Number(m[7]) / 3600;
  return {lat: m[4] === 'S' ? -lat : lat, lon: m[8] === 'W' ? -lon : lon};
}

/** The areas in airspace.txt text, in file order. */
export function parseAirspaces(text: string): Airspace[] {
  const out: Airspace[] = [];
  let d: Draft | null = null;
  const finish = (): void => {
    if (d !== null && !d.bad && d.floor && d.ceiling && d.ring.length >= 3) {
      out.push({class: d.class, name: d.name, floor: d.floor, ceiling: d.ceiling, ring: d.ring});
    }
    d = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const space = line.search(/\s/);
    const key = space < 0 ? line : line.slice(0, space);
    const rest = space < 0 ? '' : line.slice(space).trim().replace(/\s+/g, ' ');
    if (key === 'AC') {
      // Every AC line ends the previous area, even one this reader can't use (no class): never merge two areas.
      finish();
      d = {class: rest, name: '', floor: undefined, ceiling: undefined, ring: [], bad: rest === ''};
      continue;
    }
    if (d === null) continue;
    const cur: Draft = d;
    if (key === 'AN') cur.name = rest;
    else if (key === 'AL') { cur.floor = parseLimit(rest); if (cur.floor === null) cur.bad = true; }
    else if (key === 'AH') { cur.ceiling = parseLimit(rest); if (cur.ceiling === null) cur.bad = true; }
    else if (key === 'DP') { const p = parsePoint(rest); if (p === null) cur.bad = true; else cur.ring.push(p); }
  }
  finish();
  return out;
}

interface Box { minLat: number; maxLat: number; minLon: number; maxLon: number }
const boxes = new WeakMap<Airspace, Box>();

/** The longitude equivalent to `lon` nearest `near`. */
function nearLon(lon: number, near: number): number {
  return near + ((((lon - near + 180) % 360) + 360) % 360) - 180;
}

/** Bounding box with longitudes unrolled from the first corner, so a ring across the antimeridian stays whole. */
function boxOf(a: Airspace): Box {
  let b = boxes.get(a);
  if (b === undefined) {
    let prev = a.ring[0]!.lon;
    b = {minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity};
    for (const p of a.ring) {
      prev = nearLon(p.lon, prev);
      b.minLat = Math.min(b.minLat, p.lat); b.maxLat = Math.max(b.maxLat, p.lat);
      b.minLon = Math.min(b.minLon, prev); b.maxLon = Math.max(b.maxLon, prev);
    }
    boxes.set(a, b);
  }
  return b;
}

/**
 * The areas that contain the position and, when `altFt` is given, whose floor ≤ altFt ≤ ceiling. GND
 * counts as 0 ft MSL (no terrain correction).
 */
export function airspacesAt(airspaces: readonly Airspace[], lat: number, lon: number, altFt?: number): Airspace[] {
  return airspaces.filter((a) => {
    if (a.ring.length < 3) return false;
    if (altFt !== undefined && (altFt < a.floor.ft || altFt > a.ceiling.ft)) return false;
    const b = boxOf(a);
    if (lat < b.minLat || lat > b.maxLat) return false;
    const x = nearLon(lon, (b.minLon + b.maxLon) / 2);
    if (x < b.minLon || x > b.maxLon) return false;
    return pointInPolygon(lat, lon, a.ring);
  });
}
