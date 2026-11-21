// Moved from Kansei's helper (stage-2b-voice).
import {createReadStream} from 'node:fs';
import {open} from 'node:fs/promises';
import {distanceNm} from '../geo/geo.ts';
import {tenKhzToKhz} from '../xplane/atc.ts';
import type {Airport, AirportFreq, AirportSummary, FreqRole, Runway} from './types.ts';

export interface AptIndexEntry extends AirportSummary { file: string; offset: number; length: number }

const ROLES: readonly FreqRole[] = ['atis', 'unicom', 'clearance', 'ground', 'tower', 'approach', 'departure'];
const NEWLINE = 10;

function isHeaderCode(code: number): boolean {
  return code === 1 || code === 16 || code === 17;
}

/** The leading row code of a line, or -1 if it does not start with a number. */
function rowCode(line: string): number {
  const m = /^(\d+)(?:\s|$)/.exec(line);
  return m ? Number(m[1]) : -1;
}

/** Rows that change what we know about an airport; everything else is skipped. */
function isUsedCode(code: number): boolean {
  return isHeaderCode(code) || code === 99 || code === 100 || code === 1302 ||
    (code >= 50 && code <= 56) || (code >= 1050 && code <= 1056);
}

/** Builds one airport from its rows, fed one line at a time. */
class AirportBuilder {
  id: string;
  name: string;
  elevationFt: number;
  icao: string | undefined;
  datumLat = NaN;
  datumLon = NaN;
  runways: Runway[] = [];
  frequencies: AirportFreq[] = [];

  constructor(id: string, name: string, elevationFt: number) {
    this.id = id;
    this.name = name;
    this.elevationFt = elevationFt;
  }

  static fromHeader(line: string): AirportBuilder | null {
    const m = /^\d+\s+(\S+)\s+\S+\s+\S+\s+(\S+)\s*(.*)$/.exec(line);
    return m ? new AirportBuilder(m[2] as string, (m[3] as string).trim(), Number(m[1])) : null;
  }

  addLine(line: string, code: number): void {
    if (code === 100) {
      this.addRunway(line);
    } else if (code === 1302) {
      this.addMetadata(line);
    } else if ((code >= 50 && code <= 56) || (code >= 1050 && code <= 1056)) {
      this.addFrequency(line, code);
    }
  }

  private addRunway(line: string): void {
    const f = line.trim().split(/\s+/);
    const widthM = Number(f[1]);
    const nums = [f[9], f[10], f[18], f[19]].map(Number);
    if (f.length < 20 || !Number.isFinite(widthM) || !nums.every(Number.isFinite)) return;
    this.runways.push({
      widthM,
      ends: [
        {name: f[8] as string, lat: nums[0] as number, lon: nums[1] as number},
        {name: f[17] as string, lat: nums[2] as number, lon: nums[3] as number},
      ],
    });
  }

  private addMetadata(line: string): void {
    const m = /^1302\s+(\S+)\s+(.*)$/.exec(line.trim());
    if (!m) return;
    const value = (m[2] as string).trim();
    if (m[1] === 'icao_code') this.icao = value;
    else if (m[1] === 'datum_lat') this.datumLat = Number(value);
    else if (m[1] === 'datum_lon') this.datumLon = Number(value);
  }

  private addFrequency(line: string, code: number): void {
    const m = /^\d+\s+(\d+)\s*(.*)$/.exec(line.trim());
    if (!m) return;
    const role = ROLES[code % 10];
    if (!role) return;
    const raw = Number(m[1]);
    this.frequencies.push({role, khz: code >= 1000 ? raw : tenKhzToKhz(raw), name: (m[2] as string).trim()});
  }

  build(): Airport {
    let lat = this.datumLat;
    let lon = this.datumLon;
    if (this.runways.length > 0) {
      const ends = this.runways.flatMap(r => r.ends);
      lat = ends.reduce((sum, e) => sum + e.lat, 0) / ends.length;
      lon = ends.reduce((sum, e) => sum + e.lon, 0) / ends.length;
    }
    const airport: Airport = {
      id: this.id, name: this.name, elevationFt: this.elevationFt,
      lat, lon, frequencies: this.frequencies, runways: this.runways,
    };
    if (this.icao !== undefined) airport.icao = this.icao;
    return airport;
  }
}

function toEntry(airport: Airport, file: string, offset: number, length: number): AptIndexEntry {
  return {
    id: airport.id, name: airport.name, lat: airport.lat, lon: airport.lon,
    hasTower: airport.frequencies.some(f => f.role === 'tower'),
    file, offset, length,
  };
}

/** Scans one whole file once. Airports with no position (no runway and no datum) are indexed but have NaN lat/lon. */
export async function indexApt(path: string): Promise<AptIndexEntry[]> {
  const entries: AptIndexEntry[] = [];
  let current: AirportBuilder | null = null;
  let currentStart = 0;

  const finish = (end: number): void => {
    if (current) entries.push(toEntry(current.build(), path, currentStart, end - currentStart));
    current = null;
  };

  const handleLine = (line: string, start: number): void => {
    const code = rowCode(line);
    if (isHeaderCode(code)) {
      finish(start);
      current = AirportBuilder.fromHeader(line);
      currentStart = start;
    } else if (code === 99) {
      finish(start);
    } else if (current) {
      current.addLine(line, code);
    }
  };

  let carry: Buffer = Buffer.alloc(0);
  let carryStart = 0; // absolute offset of the first byte of `carry`
  let consumed = 0; // absolute offset just after the last chunk read

  for await (const chunk of createReadStream(path) as AsyncIterable<Buffer>) {
    const buf = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
    const base = carryStart; // absolute offset of buf[0]
    let lineStart = 0;
    for (;;) {
      const nl = buf.indexOf(NEWLINE, lineStart);
      if (nl < 0) break;
      if (isCandidate(buf, lineStart)) {
        const line = buf.toString('utf8', lineStart, nl).replace(/\r$/, '');
        if (isUsedCode(rowCode(line))) handleLine(line, base + lineStart);
      }
      lineStart = nl + 1;
    }
    carry = buf.subarray(lineStart);
    carryStart = base + lineStart;
    consumed = base + buf.length;
  }
  if (carry.length > 0) {
    const line = carry.toString('utf8').replace(/\r$/, '');
    if (isUsedCode(rowCode(line))) handleLine(line, carryStart);
  }
  finish(consumed);
  return entries;
}

/** Cheap pre-filter: only lines starting with '1', '5' or '9' can be a used row. */
function isCandidate(buf: Buffer, at: number): boolean {
  const b = buf[at];
  return b === 0x31 || b === 0x35 || b === 0x39;
}

/** Indexes several files, given highest priority first. When two files have the same airport id, the earlier file's airport is kept and the later one dropped. */
export async function indexAptFiles(paths: readonly string[]): Promise<AptIndexEntry[]> {
  const seen = new Set<string>();
  const all: AptIndexEntry[] = [];
  for (const path of paths) {
    for (const entry of await indexApt(path)) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      all.push(entry);
    }
  }
  return all;
}

/** Parses the text of one airport (its header row through its last row). Returns null if there is no header row. */
export function parseAirport(text: string): Airport | null {
  let builder: AirportBuilder | null = null;
  for (const line of text.split(/\r?\n/)) {
    const code = rowCode(line);
    if (!builder) {
      if (isHeaderCode(code)) builder = AirportBuilder.fromHeader(line);
    } else if (isHeaderCode(code) || code === 99) {
      break;
    } else {
      builder.addLine(line, code);
    }
  }
  return builder ? builder.build() : null;
}

/** Reads `entry.length` bytes at `entry.offset` of `entry.file` and parses them. */
export async function readAirport(entry: AptIndexEntry): Promise<Airport | null> {
  const handle = await open(entry.file, 'r');
  try {
    const buf = Buffer.alloc(entry.length);
    const {bytesRead} = await handle.read(buf, 0, entry.length, entry.offset);
    return parseAirport(buf.toString('utf8', 0, bytesRead));
  } finally {
    await handle.close();
  }
}

/** Entries within `nm` of the point, nearest first, at most `limit`, each with distanceNm rounded to 0.1. */
export function airportsNear(index: readonly AptIndexEntry[], lat: number, lon: number, nm: number, limit: number): AirportSummary[] {
  const found: AirportSummary[] = [];
  for (const e of index) {
    if (Number.isNaN(e.lat) || Number.isNaN(e.lon)) continue;
    const d = distanceNm(lat, lon, e.lat, e.lon);
    if (d <= nm) {
      found.push({id: e.id, name: e.name, lat: e.lat, lon: e.lon, hasTower: e.hasTower, distanceNm: Math.round(d * 10) / 10});
    }
  }
  found.sort((a, b) => (a.distanceNm as number) - (b.distanceNm as number));
  return found.slice(0, limit);
}
