/**
 * A fake NOAA bucket for tests of the GFS reader: forecast files made of labelled fake
 * messages, their index text, a decoder for those messages, and a fetch that serves indexes
 * and byte ranges. Test-only; nothing here is used by the app.
 */
import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { GribField } from './grib2.ts';
import { fileUrl } from './noaa-index.ts';
import type { GfsVar } from './noaa-index.ts';

export const HOUR_MS = 3_600_000;
export const NOW = new Date('2026-11-17T14:00:00Z');
export const RUN_12Z = Date.parse('2026-11-17T12:00:00Z');
export const RUN_06Z = Date.parse('2026-11-17T06:00:00Z');
export const NX = 360;
export const NY = 181;
export const KT_PER_MS = 3600 / 1852;

/** A 360 x 181 field whose value at (row, col) is `fn(lat of row, col)`. */
export function field(fn: (lat: number, col: number) => number, over: Partial<GribField> = {}): GribField {
  const values = new Float32Array(NX * NY);
  for (let r = 0; r < NY; r++) {
    for (let c = 0; c < NX; c++) values[r * NX + c] = fn(90 - r, c);
  }
  return {
    discipline: 0,
    category: 2,
    parameter: 2,
    surfaceType: 100,
    surfaceValue: 25000,
    forecastHours: 0,
    referenceUtc: '2026-11-17T12:00',
    nx: NX,
    ny: NY,
    values,
    ...over,
  };
}

export const PARAM: Record<GfsVar, [number, number]> = { UGRD: [2, 2], VGRD: [2, 3], TMP: [0, 0] };

/** Level key in labels: hPa number or 'sfc'. */
export type LevelKey = number | 'sfc';

/**
 * The test atmosphere: U is 0; V is -(hpa / 25 + fh / 3) m/s (a north wind whose
 * speed tells level and forecast hour apart); TMP is -hpa / 5 C plus lat / 10.
 * Surface: U = -5, V = 0 (from 90 at 9.72 kt).
 */
export function fakeField(v: GfsVar, level: LevelKey, runIso: string, fh: number): GribField {
  const [category, parameter] = PARAM[v];
  const hpa = level === 'sfc' ? 0 : level;
  const fn =
    level === 'sfc'
      ? (): number => (v === 'UGRD' ? -5 : 0)
      : v === 'UGRD'
        ? (): number => 0
        : v === 'VGRD'
          ? (): number => -(hpa / 25 + fh / 3)
          : (lat: number): number => 273.15 - hpa / 5 + lat / 10;
  return field(fn, {
    category,
    parameter,
    surfaceType: level === 'sfc' ? 103 : 100,
    surfaceValue: level === 'sfc' ? 10 : hpa * 100,
    forecastHours: fh,
    referenceUtc: runIso,
  });
}

export const MSG_BYTES = 64;
export const LEVELS: LevelKey[] = [200, 250, 300, 'sfc'];

/** A forecast file of fake messages (a label padded to MSG_BYTES) and its index text. */
export function fakeFile(runMs: number, fh: number): { bytes: Uint8Array<ArrayBuffer>; idx: string } {
  const runIso = new Date(runMs).toISOString().slice(0, 13) + ':00';
  const records: Array<{ v: string; levelText: string; label: string }> = [];
  for (const l of LEVELS) {
    const levelText = l === 'sfc' ? '10 m above ground' : `${l} mb`;
    const vars: GfsVar[] = l === 'sfc' ? ['UGRD', 'VGRD'] : ['TMP', 'UGRD', 'VGRD'];
    for (const v of vars) records.push({ v, levelText, label: `${v}|${l}|${runIso}|${fh}` });
  }
  records.push({ v: 'HGT', levelText: '500 mb', label: 'HGT' });
  const bytes = new Uint8Array(records.length * MSG_BYTES);
  const enc = new TextEncoder();
  const lines = records.map((r, i) => {
    bytes.set(enc.encode(r.label), i * MSG_BYTES);
    return `${i + 1}:${i * MSG_BYTES}:d=x:${r.v}:${r.levelText}:${fh} hour fcst:`;
  });
  return { bytes, idx: lines.join('\n') + '\n' };
}

/** Decodes a fake message (one label padded with zeros). */
export function fakeDecode(bytes: Uint8Array): GribField | undefined {
  const label = new TextDecoder().decode(bytes).replace(/\0+$/, '');
  const [v, l, runIso, fh] = label.split('|');
  if (v !== 'UGRD' && v !== 'VGRD' && v !== 'TMP') return undefined;
  if (l === undefined || runIso === undefined || fh === undefined) return undefined;
  return fakeField(v, l === 'sfc' ? 'sfc' : Number(l), runIso, Number(fh));
}

export interface FakeServer {
  fetch: Mock<(input: string, init?: RequestInit) => Promise<Response>>;
  /** URL + range of every request, in order. */
  log: string[];
}

export interface ServerOpts {
  /** Runs whose files exist (default: 12Z and 06Z). */
  runs?: number[];
  /** Index URLs answered 404 even though the run exists. */
  missingIdx?: string[];
  /** Override for a range response. */
  rangeResponse?: (bytes: Uint8Array<ArrayBuffer>) => Response;
  /** Index lines left out of every index of one run, e.g. ':TMP:250 mb:'. */
  dropFromIdx?: { runMs: number; line: string };
}

export function server(opts: ServerOpts = {}): FakeServer {
  const runs = opts.runs ?? [RUN_12Z, RUN_06Z];
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const idxs = new Map<string, string>();
  for (const r of runs) {
    for (let fh = 0; fh <= 384; fh += 3) {
      const url = fileUrl(r, fh);
      const f = fakeFile(r, fh);
      files.set(url, f.bytes);
      const drop = opts.dropFromIdx;
      const idx =
        drop && drop.runMs === r
          ? f.idx
              .split('\n')
              .filter((l) => !l.includes(drop.line))
              .join('\n')
          : f.idx;
      idxs.set(`${url}.idx`, idx);
    }
  }
  const log: string[] = [];
  const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    const range = new Headers(init?.headers).get('Range');
    log.push(range ? `${url} ${range}` : url);
    if (url.endsWith('.idx')) {
      const idx = idxs.get(url);
      if (idx === undefined || opts.missingIdx?.includes(url)) return new Response('no', { status: 404 });
      return new Response(idx, { status: 200 });
    }
    const file = files.get(url);
    const m = range ? /^bytes=(\d+)-(\d+)$/.exec(range) : null;
    if (!file || !m) return new Response('bad', { status: 400 });
    const part = file.slice(Number(m[1]), Number(m[2]) + 1);
    if (opts.rangeResponse) return opts.rangeResponse(part);
    return new Response(part, { status: 206 });
  });
  return { fetch: fetchFn, log };
}
