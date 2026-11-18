export const NOAA_BASE = 'https://noaa-gfs-bdp-pds.s3.amazonaws.com';
export const RUN_STEP_H = 6;
export const FILE_STEP_H = 3;
export const MAX_FORECAST_H = 384;
const HOUR_MS = 3_600_000;
const CANDIDATE_COUNT = 4;
function pad2(n) {
    return String(n).padStart(2, '0');
}
/** URL of a forecast file; runMs is the run time (UTC ms, a multiple of 6 h), fh the forecast hour. */
export function fileUrl(runMs, fh) {
    const d = new Date(runMs);
    const day = `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
    const hh = pad2(d.getUTCHours());
    return `${NOAA_BASE}/gfs.${day}/${hh}/atmos/gfs.t${hh}z.pgrb2.1p00.f${String(fh).padStart(3, '0')}`;
}
function levelText(level) {
    return 'surface' in level ? '10 m above ground' : `${level.hpa} mb`;
}
/** Range of one field in an index text; undefined if absent or if it is the last line (no end known). */
export function fieldRange(idx, v, level) {
    const lines = idx.split('\n').filter((l) => l.trim() !== '');
    const wanted = levelText(level);
    for (let i = 0; i < lines.length; i++) {
        const f = lines[i].split(':');
        if (f[3] !== v || f[4] !== wanted)
            continue;
        const next = lines[i + 1];
        if (next === undefined)
            return undefined;
        const start = Number(f[1]);
        const nextStart = Number(next.split(':')[1]);
        if (!Number.isFinite(start) || !Number.isFinite(nextStart))
            return undefined;
        return { start, end: nextStart - 1 };
    }
    return undefined;
}
/** Candidate runs, newest first: the latest run at or before nowMs, then 3 older ones. */
export function candidateRuns(nowMs) {
    const step = RUN_STEP_H * HOUR_MS;
    const latest = Math.floor(nowMs / step) * step;
    const runs = [];
    for (let i = 0; i < CANDIDATE_COUNT; i++)
        runs.push(latest - i * step);
    return runs;
}
/** Forecast hour (multiple of 3) of `runMs` nearest to `validMs`; undefined outside 0..384. */
export function forecastHour(runMs, validMs) {
    const h = (validMs - runMs) / HOUR_MS;
    if (h < 0 || h > MAX_FORECAST_H)
        return undefined;
    return Math.floor(h / FILE_STEP_H + 0.5) * FILE_STEP_H;
}
