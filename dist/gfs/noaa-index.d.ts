export declare const NOAA_BASE = "https://noaa-gfs-bdp-pds.s3.amazonaws.com";
export declare const RUN_STEP_H = 6;
export declare const FILE_STEP_H = 3;
export declare const MAX_FORECAST_H = 384;
export type GfsVar = 'UGRD' | 'VGRD' | 'TMP';
/** '250 mb' style level text for a pressure level; '10 m above ground' for the surface wind. */
export type GfsLevel = {
    hpa: number;
} | {
    surface: true;
};
export interface ByteRange {
    start: number;
    end: number;
}
/** URL of a forecast file; runMs is the run time (UTC ms, a multiple of 6 h), fh the forecast hour. */
export declare function fileUrl(runMs: number, fh: number): string;
/** Range of one field in an index text; undefined if absent or if it is the last line (no end known). */
export declare function fieldRange(idx: string, v: GfsVar, level: GfsLevel): ByteRange | undefined;
/** Candidate runs, newest first: the latest run at or before nowMs, then 3 older ones. */
export declare function candidateRuns(nowMs: number): number[];
/** Forecast hour (multiple of 3) of `runMs` nearest to `validMs`; undefined outside 0..384. */
export declare function forecastHour(runMs: number, validMs: number): number | undefined;
