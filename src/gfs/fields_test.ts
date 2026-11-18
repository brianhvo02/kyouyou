import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOUR_MS, NOW, NX, NY, RUN_06Z, RUN_12Z, fakeDecode, field, server } from './fake-gfs.ts';
import { GFS_TIMEOUT_MS, createGfsFields, fieldKey, sampleField, windFromUv } from './fields.ts';
import type { FieldSpec, GfsFields } from './fields.ts';
import type { GribField } from './grib2.ts';
import { fileUrl } from './noaa-index.ts';

afterEach(() => {
  vi.useRealTimers();
});

const AT_15Z = RUN_12Z + 3 * HOUR_MS;
const WIND_250: FieldSpec[] = [
  { v: 'UGRD', level: { hpa: 250 } },
  { v: 'VGRD', level: { hpa: 250 } },
];
const ALL_250: FieldSpec[] = [...WIND_250, { v: 'TMP', level: { hpa: 250 } }];

function reader(s: { fetch: unknown }, decode = fakeDecode, now: () => Date = () => NOW): GfsFields {
  return createGfsFields(s.fetch as typeof fetch, now, decode);
}

describe('windFromUv', () => {
  it('gives the direction the wind blows from, and knots', () => {
    const n = windFromUv(0, -10);
    expect(n.dirDeg).toBeCloseTo(0, 6);
    expect(n.speedKt).toBeCloseTo(19.44, 2);
    expect(windFromUv(-10, 0).dirDeg).toBeCloseTo(90, 6);
    expect(windFromUv(0, 10).dirDeg).toBeCloseTo(180, 6);
    expect(windFromUv(10, 0).dirDeg).toBeCloseTo(270, 6);
  });
  it('keeps direction in 0..360', () => {
    for (const [u, v] of [[0, -10], [-1e-9, -10], [1e-9, -10], [0, 0]]) {
      const d = windFromUv(u ?? 0, v ?? 0).dirDeg;
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(360);
    }
  });
});

describe('sampleField', () => {
  const byLat = field((lat) => lat);
  const byCol = field((_lat, col) => col);
  it('interpolates between rows', () => {
    expect(sampleField(byLat, 37.5, 10)).toBeCloseTo(37.5, 5);
  });
  it('wraps between the last and first column', () => {
    expect(sampleField(byCol, 0, 359.5)).toBeCloseTo((359 + 0) / 2, 5);
    expect(sampleField(byCol, 0, -0.5)).toBeCloseTo((359 + 0) / 2, 5);
  });
  it('treats -180 and 180 as the same longitude', () => {
    expect(sampleField(byCol, 0, -180)).toBe(sampleField(byCol, 0, 180));
    expect(sampleField(byCol, 0, 180)).toBeCloseTo(180, 5);
    expect(sampleField(byCol, 0, -90)).toBeCloseTo(270, 5);
    expect(sampleField(byCol, 0, 720 + 10)).toBeCloseTo(10, 5);
  });
  it('reads the pole rows without leaving the array', () => {
    const byRow = field((lat, col) => (lat === 90 ? 1000 + col : lat === -90 ? -1000 - col : 0));
    expect(sampleField(byRow, 90, 123)).toBeCloseTo(1123, 3);
    expect(sampleField(byRow, -90, 123)).toBeCloseTo(-1123, 3);
    expect(Number.isFinite(sampleField(byRow, 90, 359.9))).toBe(true);
    expect(Number.isFinite(sampleField(byRow, -90, 359.9))).toBe(true);
  });
});

describe('createGfsFields load', () => {
  it('fetches one index and the needed ranges, all from the newest run', async () => {
    const s = server();
    const loaded = await reader(s).load([AT_15Z], ALL_250);
    expect(loaded?.runMs).toBe(RUN_12Z);
    expect(loaded?.fhs).toEqual([3]);
    // The test atmosphere's V at 250 hPa, forecast hour 3.
    expect(loaded?.fields.get(fieldKey(RUN_12Z, 3, { v: 'VGRD', level: { hpa: 250 } }))?.values[0]).toBeCloseTo(-(250 / 25 + 3 / 3), 5);
    // One index, one range for TMP and one shared range for the adjacent UGRD and VGRD.
    expect(s.log).toHaveLength(3);
    expect(s.log[0]).toBe(`${fileUrl(RUN_12Z, 3)}.idx`);
  });

  it('uses the forecast file nearest each valid time', async () => {
    const loaded = await reader(server()).load([AT_15Z, RUN_12Z + 7.4 * HOUR_MS], WIND_250);
    expect(loaded?.fhs).toEqual([3, 6]);
  });

  it('makes no request for a repeated call, and shares requests between concurrent calls', async () => {
    const s = server();
    const gfs = reader(s);
    const [a, b] = await Promise.all([gfs.load([AT_15Z], ALL_250), gfs.load([AT_15Z], ALL_250)]);
    expect(a).toBeDefined();
    expect(b?.runMs).toBe(a?.runMs);
    expect(s.log).toHaveLength(3);
    await gfs.load([AT_15Z], ALL_250);
    expect(s.log).toHaveLength(3);
  });

  it('steps back to the next older run for every time when an index is missing', async () => {
    const s = server({ missingIdx: [`${fileUrl(RUN_12Z, 6)}.idx`] });
    const loaded = await reader(s).load([AT_15Z, RUN_12Z + 6 * HOUR_MS], WIND_250);
    expect(loaded?.runMs).toBe(RUN_06Z);
    expect(loaded?.fhs).toEqual([9, 12]);
    expect(s.log.some((l) => l.startsWith(`${fileUrl(RUN_12Z, 3)} `))).toBe(false);
  });

  it('steps back when a needed field is not in the newest index', async () => {
    const s = server({ dropFromIdx: { runMs: RUN_12Z, line: ':TMP:250 mb:' } });
    const loaded = await reader(s).load([AT_15Z], ALL_250);
    expect(loaded?.runMs).toBe(RUN_06Z);
    expect(s.log.some((l) => l.startsWith(`${fileUrl(RUN_12Z, 3)} `))).toBe(false);
  });

  it('is undefined, with no range request, when no run lists a needed field', async () => {
    const s = server();
    expect(await reader(s).load([AT_15Z], [{ v: 'UGRD', level: { hpa: 150 } }])).toBeUndefined();
    expect(s.log.every((l) => l.endsWith('.idx'))).toBe(true);
  });

  it('is undefined when none of the four candidate runs is published', async () => {
    const s = server({ runs: [] });
    expect(await reader(s).load([AT_15Z], WIND_250)).toBeUndefined();
    expect(s.log).toHaveLength(4);
  });

  it('is undefined when a range is answered with the whole file (status 200)', async () => {
    const s = server({ rangeResponse: (b) => new Response(b, { status: 200 }) });
    expect(await reader(s).load([AT_15Z], WIND_250)).toBeUndefined();
  });

  it('is undefined when a range body is short', async () => {
    const s = server({ rangeResponse: (b) => new Response(b.slice(0, -1), { status: 206 }) });
    expect(await reader(s).load([AT_15Z], WIND_250)).toBeUndefined();
  });

  it('retries a failed download on a later call', async () => {
    let fail = true;
    const s = server({ rangeResponse: (b) => new Response(b, { status: fail ? 500 : 206 }) });
    const gfs = reader(s);
    expect(await gfs.load([AT_15Z], WIND_250)).toBeUndefined();
    fail = false;
    expect(await gfs.load([AT_15Z], WIND_250)).toBeDefined();
  });

  it.each<[string, (f: GribField) => GribField]>([
    ['variable', (f) => ({ ...f, parameter: f.parameter === 2 ? 3 : f.parameter })],
    ['discipline', (f) => ({ ...f, discipline: 10 })],
    ['level', (f) => ({ ...f, surfaceValue: f.surfaceValue + 5000 })],
    ['surface type', (f) => ({ ...f, surfaceType: 103 })],
    ['forecast hour', (f) => ({ ...f, forecastHours: f.forecastHours + 3 })],
    ['run', (f) => ({ ...f, referenceUtc: '2026-11-17T06:00' })],
    ['grid size', (f) => ({ ...f, values: f.values.slice(1) })],
  ])('is undefined when a decoded field has the wrong %s', async (_name, lie) => {
    const decode = (b: Uint8Array): GribField | undefined => {
      const f = fakeDecode(b);
      return f && f.category === 2 && f.parameter === 2 ? lie(f) : f;
    };
    expect(await reader(server(), decode).load([AT_15Z], WIND_250)).toBeUndefined();
  });

  it('is undefined when fetch throws', async () => {
    const f = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await reader({ fetch: f }).load([AT_15Z], WIND_250)).toBeUndefined();
  });

  it('evicts cached indexes and fields of runs no longer among the candidates', async () => {
    const s = server();
    let clock = NOW;
    const gfs = reader(s, fakeDecode, () => clock);
    expect(await gfs.load([AT_15Z], WIND_250)).toBeDefined();
    const filled = s.log.length;
    expect(await gfs.load([AT_15Z], WIND_250)).toBeDefined();
    expect(s.log).toHaveLength(filled);
    // A day and more later the 12Z and 06Z runs are no longer candidates.
    clock = new Date(NOW.getTime() + 30 * HOUR_MS);
    await gfs.load([clock.getTime() + HOUR_MS], WIND_250);
    const later = s.log.length;
    clock = NOW;
    expect(await gfs.load([AT_15Z], WIND_250)).toBeDefined();
    // Index and range are fetched again: they were evicted.
    expect(s.log.length - later).toBe(filled);
  });

  it('keeps at most 8 requests in flight', async () => {
    const s = server();
    let active = 0;
    let peak = 0;
    const slow = vi.fn(async (input: string, init?: RequestInit) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      try {
        return await s.fetch(input, init);
      } finally {
        active--;
      }
    });
    const specs: FieldSpec[] = [200, 250, 300].flatMap((hpa) => [
      { v: 'UGRD' as const, level: { hpa } },
      { v: 'VGRD' as const, level: { hpa } },
      { v: 'TMP' as const, level: { hpa } },
    ]);
    const times = [3, 6, 9, 12].map((h) => RUN_12Z + h * HOUR_MS);
    expect(await reader({ fetch: slow }).load(times, specs)).toBeDefined();
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
  });
});

describe('windField (the whole globe at one level)', () => {
  it('returns U and V of the forecast file nearest the time, with one index and one range request', async () => {
    const s = server();
    const gfs = reader(s);
    const w = await gfs.windField(250, RUN_12Z + 3.4 * HOUR_MS);
    expect(w?.runMs).toBe(RUN_12Z);
    expect(w?.forecastHour).toBe(3);
    expect(w?.validMs).toBe(RUN_12Z + 3 * HOUR_MS);
    expect([w?.nx, w?.ny]).toEqual([NX, NY]);
    expect(w?.u.length).toBe(NX * NY);
    expect(w?.u[0]).toBe(0);
    // The test atmosphere's V at 250 hPa, forecast hour 3.
    expect(w?.v[1234]).toBeCloseTo(-(250 / 25 + 3 / 3), 5);
    expect(s.log.length).toBe(2);
    // A second call for the same level and file downloads nothing.
    await gfs.windField(250, RUN_12Z + 3 * HOUR_MS);
    expect(s.log.length).toBe(2);
  });

  it('is undefined for a level the files do not have, a bad level or a time out of range', async () => {
    const s = server();
    const gfs = reader(s);
    expect(await gfs.windField(150, RUN_12Z + 3 * HOUR_MS)).toBeUndefined();
    expect(await gfs.windField(0, RUN_12Z + 3 * HOUR_MS)).toBeUndefined();
    expect(await gfs.windField(250, Number.NaN)).toBeUndefined();
    expect(await gfs.windField(250, RUN_12Z + 400 * HOUR_MS)).toBeUndefined();
  });

  it('steps back to an older run when the newest has not published the file', async () => {
    const s = server({ missingIdx: [`${fileUrl(RUN_12Z, 3)}.idx`] });
    const gfs = reader(s);
    const w = await gfs.windField(250, RUN_12Z + 3 * HOUR_MS);
    expect(w?.runMs).toBe(RUN_06Z);
    expect(w?.forecastHour).toBe(9);
  });
});

describe('windField time limit', () => {
  it('resolves undefined after GFS_TIMEOUT_MS when a request never answers', async () => {
    vi.useFakeTimers();
    const f = vi.fn(() => new Promise<Response>(() => undefined));
    let done = false;
    let result: unknown = 'pending';
    void reader({ fetch: f }).windField(250, AT_15Z).then((r) => {
      done = true;
      result = r;
    });
    await vi.advanceTimersByTimeAsync(GFS_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    expect(result).toBeUndefined();
  });
});
