/**
 * Reads NOAA GFS 1-degree fields straight from NOAA's public bucket. This folder
 * (`src/wx/gfs`) is self-contained: it imports nothing from the rest of Kōro, so it can
 * be copied whole into another project (Kōkūzu's wind layer uses a copy; Kōro's is the
 * source).
 */
import { decodeGrib2 } from "./grib2.js";
import { candidateRuns, fieldRange, fileUrl, forecastHour } from "./noaa-index.js";
/** Time limit for one call, and for each request in it. */
export const GFS_TIMEOUT_MS = 20_000;
export const HOUR_MS = 3_600_000;
const MAX_PARALLEL = 8;
/** A 1-degree field is tens of kilobytes; anything far larger is not a single field. */
const MAX_FIELD_BYTES = 1 << 20;
const KT_PER_MS = 3600 / 1852;
const NX = 360;
const NY = 181;
/** GRIB2 discipline, category and parameter of each variable. */
const PARAMS = {
    UGRD: [0, 2, 2],
    VGRD: [0, 2, 3],
    TMP: [0, 0, 0],
};
/** 'YYYY-MM-DDTHH:00' for a UTC time. */
export function hourString(ms) {
    return new Date(ms).toISOString().slice(0, 13) + ':00';
}
function levelKey(level) {
    return 'surface' in level ? 'sfc' : String(level.hpa);
}
export function fieldKey(runMs, fh, s) {
    return `${runMs}|${fh}|${s.v}|${levelKey(s.level)}`;
}
/** Bilinear sample of a 360 x 181 field at a point (longitude any range). */
export function sampleField(f, lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || f.nx < 2 || f.ny < 2)
        return NaN;
    const dLat = 180 / (f.ny - 1);
    const dLon = 360 / f.nx;
    const row = (90 - Math.max(-90, Math.min(90, lat))) / dLat;
    const r0 = Math.min(f.ny - 1, Math.floor(row));
    const r1 = Math.min(f.ny - 1, r0 + 1);
    const ty = row - r0;
    const col = (((lon % 360) + 360) % 360) / dLon;
    const c0 = Math.floor(col) % f.nx;
    const c1 = (c0 + 1) % f.nx;
    const tx = col - Math.floor(col);
    const at = (r, c) => f.values[r * f.nx + c] ?? NaN;
    const top = at(r0, c0) * (1 - tx) + at(r0, c1) * tx;
    const bottom = at(r1, c0) * (1 - tx) + at(r1, c1) * tx;
    return top * (1 - ty) + bottom * ty;
}
/** Direction FROM (degrees true, 0..360) and speed in knots from U and V in m/s. */
export function windFromUv(u, v) {
    const deg = (Math.atan2(-u, -v) * 180) / Math.PI;
    const dirDeg = ((deg % 360) + 360) % 360;
    return { dirDeg: dirDeg >= 360 ? 0 : dirDeg, speedKt: Math.hypot(u, v) * KT_PER_MS };
}
/** Runs tasks with at most `max` at a time. */
function limiter(max) {
    let active = 0;
    const queue = [];
    return async (task) => {
        while (active >= max)
            await new Promise((r) => queue.push(r));
        active++;
        try {
            return await task();
        }
        finally {
            active--;
            queue.shift()?.();
        }
    };
}
/** True when a decoded field is exactly the asked variable, level, forecast hour and run on the 1-degree grid. */
function matches(f, s, fh, runMs) {
    const [discipline, category, parameter] = PARAMS[s.v];
    const surfaceOk = 'surface' in s.level
        ? f.surfaceType === 103 && f.surfaceValue === 10
        : f.surfaceType === 100 && f.surfaceValue === s.level.hpa * 100;
    return (f.discipline === discipline &&
        f.category === category &&
        f.parameter === parameter &&
        surfaceOk &&
        f.forecastHours === fh &&
        f.referenceUtc === hourString(runMs) &&
        f.nx === NX &&
        f.ny === NY &&
        f.values.length === NX * NY);
}
/** Caches a promise under `key` and drops it again if it resolves undefined, so failures are retried later. */
function remember(map, key, p) {
    map.set(key, p);
    void p.then((v) => {
        if (v === undefined && map.get(key) === p)
            map.delete(key);
    });
    return p;
}
/**
 * Resolves undefined after GFS_TIMEOUT_MS, or with `p` (undefined if it rejects), whichever
 * is first. Requests still running when the limit fires are deliberately not cancelled: on a
 * slow connection they finish and fill the cache, so the next call succeeds.
 */
export function withTimeLimit(p) {
    let timer;
    const limit = new Promise((resolve) => {
        timer = setTimeout(() => resolve(undefined), GFS_TIMEOUT_MS);
    });
    return Promise.race([p.catch(() => undefined), limit]).finally(() => clearTimeout(timer));
}
/**
 * Per forecast file, the index (.idx) gives each needed field's byte range, and only those
 * ranges are downloaded and decoded. One run serves every valid time of a call: the newest
 * candidate run whose indexes of every needed file answer and list every needed field.
 * Indexes and decoded fields are cached and shared while in flight; each call first drops
 * those of runs no longer among the candidate runs, so at most four runs are kept.
 * Failures are not cached. `decode` is injectable for tests only.
 */
export function createGfsFields(fetchFn, now, decode = decodeGrib2) {
    /** `${runMs}|${fh}` -> index text. */
    const indexes = new Map();
    /** fieldKey -> decoded, checked field. */
    const fields = new Map();
    const limit = limiter(MAX_PARALLEL);
    function getIndex(runMs, fh) {
        const key = `${runMs}|${fh}`;
        const cached = indexes.get(key);
        if (cached)
            return cached;
        const url = `${fileUrl(runMs, fh)}.idx`;
        const p = limit(async () => {
            const res = await fetchFn(url, { signal: AbortSignal.timeout(GFS_TIMEOUT_MS) });
            if (res.status !== 200) {
                void res.body?.cancel().catch(() => undefined);
                return undefined;
            }
            return await res.text();
        }).catch(() => undefined);
        return remember(indexes, key, p);
    }
    /** Exactly the bytes of `r`, or undefined (anything but a 206 of the full length fails). */
    function getRange(url, r) {
        const size = r.end - r.start + 1;
        return limit(async () => {
            const res = await fetchFn(url, {
                headers: { Range: `bytes=${r.start}-${r.end}` },
                signal: AbortSignal.timeout(GFS_TIMEOUT_MS),
            });
            if (res.status !== 206) {
                void res.body?.cancel().catch(() => undefined);
                return undefined;
            }
            const bytes = new Uint8Array(await res.arrayBuffer());
            return bytes.length === size ? bytes : undefined;
        }).catch(() => undefined);
    }
    /**
     * Starts (or joins) the downloads of the given fields of one file; a UGRD and the
     * VGRD of the same level, both not yet cached or in flight, share a request when
     * adjacent in the file.
     */
    function requestFields(runMs, fh, items) {
        const url = fileUrl(runMs, fh);
        const todo = items
            .filter((it) => !fields.has(fieldKey(runMs, fh, it.spec)))
            .sort((a, b) => a.range.start - b.range.start);
        const seen = new Set();
        const groups = [];
        for (const it of todo) {
            const key = fieldKey(runMs, fh, it.spec);
            if (seen.has(key))
                continue;
            seen.add(key);
            const last = groups[groups.length - 1];
            const prev = last?.[last.length - 1];
            const pairs = last?.length === 1 &&
                prev?.spec.v === 'UGRD' &&
                it.spec.v === 'VGRD' &&
                levelKey(prev.spec.level) === levelKey(it.spec.level) &&
                it.range.start === prev.range.end + 1;
            if (last && pairs)
                last.push(it);
            else
                groups.push([it]);
        }
        for (const group of groups) {
            const first = group[0];
            const end = group[group.length - 1];
            if (!first || !end)
                continue;
            const base = first.range.start;
            const bytes = getRange(url, { start: base, end: end.range.end });
            for (const it of group) {
                const p = bytes.then((b) => {
                    if (!b)
                        return undefined;
                    const f = decode(b.subarray(it.range.start - base, it.range.end - base + 1));
                    return f && matches(f, it.spec, fh, runMs) ? f : undefined;
                }).catch(() => undefined);
                remember(fields, fieldKey(runMs, fh, it.spec), p);
            }
        }
    }
    /**
     * Drops cached and in-flight entries of runs not in `keep`. Calls waiting on a dropped
     * promise still get its result; only later lookups miss.
     */
    function evictExcept(keep) {
        const kept = new Set(keep.map(String));
        for (const map of [indexes, fields]) {
            for (const key of map.keys()) {
                if (!kept.has(key.slice(0, key.indexOf('|'))))
                    map.delete(key);
            }
        }
    }
    async function load(validMs, specs) {
        const candidates = candidateRuns(now().getTime());
        evictExcept(candidates);
        const runs = candidates
            .map((runMs) => ({ runMs, fhs: validMs.map((ms) => forecastHour(runMs, ms)) }))
            .filter((c) => c.fhs.every((h) => h !== undefined));
        for (const { runMs, fhs } of runs) {
            const files = [...new Set(fhs)];
            const texts = await Promise.all(files.map((fh) => getIndex(runMs, fh)));
            const plan = [];
            let usable = true;
            files.forEach((fh, i) => {
                const idx = texts[i];
                if (idx === undefined) {
                    usable = false;
                    return;
                }
                const items = [];
                for (const spec of specs) {
                    const range = fieldRange(idx, spec.v, spec.level);
                    if (!range || range.end < range.start || range.end - range.start + 1 > MAX_FIELD_BYTES) {
                        usable = false;
                        return;
                    }
                    items.push({ spec, range });
                }
                plan.push({ fh, items });
            });
            if (!usable)
                continue;
            for (const { fh, items } of plan)
                requestFields(runMs, fh, items);
            const keys = plan.flatMap(({ fh }) => specs.map((s) => fieldKey(runMs, fh, s)));
            const got = await Promise.all(keys.map((k) => fields.get(k) ?? Promise.resolve(undefined)));
            const out = new Map();
            for (let i = 0; i < keys.length; i++) {
                const f = got[i];
                const k = keys[i];
                if (!f || k === undefined)
                    return undefined;
                out.set(k, f);
            }
            return { runMs, fhs, fields: out };
        }
        return undefined;
    }
    async function windField(hpa, validMs) {
        if (!Number.isInteger(hpa) || hpa <= 0 || !Number.isFinite(validMs))
            return undefined;
        const specs = [
            { v: 'UGRD', level: { hpa } },
            { v: 'VGRD', level: { hpa } },
        ];
        const loaded = await load([validMs], specs);
        const fh = loaded?.fhs[0];
        if (!loaded || fh === undefined)
            return undefined;
        const [u, v] = specs.map((s) => loaded.fields.get(fieldKey(loaded.runMs, fh, s)));
        if (!u || !v)
            return undefined;
        return {
            runMs: loaded.runMs,
            forecastHour: fh,
            validMs: loaded.runMs + fh * HOUR_MS,
            nx: u.nx,
            ny: u.ny,
            u: u.values,
            v: v.values,
        };
    }
    return { load, windField: (hpa, validMs) => withTimeLimit(windField(hpa, validMs)) };
}
