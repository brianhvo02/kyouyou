import type { GribField } from './grib2.ts';
import type { GfsLevel, GfsVar } from './noaa-index.ts';
/** Time limit for one call, and for each request in it. */
export declare const GFS_TIMEOUT_MS = 20000;
export declare const HOUR_MS = 3600000;
export interface FieldSpec {
    v: GfsVar;
    level: GfsLevel;
}
export interface Loaded {
    runMs: number;
    /** Forecast hour used for each valid time, by position. */
    fhs: number[];
    /** Fields by fieldKey. */
    fields: Map<string, GribField>;
}
/** The wind over the whole globe at one pressure level and one forecast file. */
export interface WindField {
    /** Model run time, UTC ms. */
    runMs: number;
    forecastHour: number;
    /** Time the data is valid for (run + forecast hour), UTC ms. */
    validMs: number;
    /** Grid size: 360 x 181, row 0 at 90 N, column 0 at 0 E going east, 1 degree apart. */
    nx: number;
    ny: number;
    /** Eastward and northward wind, m/s, row-major. */
    u: Float32Array;
    v: Float32Array;
}
export interface GfsFields {
    /** Fields `specs` at every valid time, all from one run; undefined if any is unavailable. */
    load(validMs: readonly number[], specs: readonly FieldSpec[]): Promise<Loaded | undefined>;
    /**
     * The global wind at `hpa` from the forecast file nearest `validMs`; undefined when
     * unavailable or after GFS_TIMEOUT_MS.
     */
    windField(hpa: number, validMs: number): Promise<WindField | undefined>;
}
/** 'YYYY-MM-DDTHH:00' for a UTC time. */
export declare function hourString(ms: number): string;
export declare function fieldKey(runMs: number, fh: number, s: FieldSpec): string;
/** Bilinear sample of a 360 x 181 field at a point (longitude any range). */
export declare function sampleField(f: GribField, lat: number, lon: number): number;
/** Direction FROM (degrees true, 0..360) and speed in knots from U and V in m/s. */
export declare function windFromUv(u: number, v: number): {
    dirDeg: number;
    speedKt: number;
};
/**
 * Resolves undefined after GFS_TIMEOUT_MS, or with `p` (undefined if it rejects), whichever
 * is first. Requests still running when the limit fires are deliberately not cancelled: on a
 * slow connection they finish and fill the cache, so the next call succeeds.
 */
export declare function withTimeLimit<T>(p: Promise<T | undefined>): Promise<T | undefined>;
/**
 * Per forecast file, the index (.idx) gives each needed field's byte range, and only those
 * ranges are downloaded and decoded. One run serves every valid time of a call: the newest
 * candidate run whose indexes of every needed file answer and list every needed field.
 * Indexes and decoded fields are cached and shared while in flight; each call first drops
 * those of runs no longer among the candidate runs, so at most four runs are kept.
 * Failures are not cached. `decode` is injectable for tests only.
 */
export declare function createGfsFields(fetchFn: typeof fetch, now: () => Date, decode?: (bytes: Uint8Array) => GribField | undefined): GfsFields;
