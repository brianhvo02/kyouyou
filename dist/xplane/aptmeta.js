// Reader for X-Plane's earth_aptmeta.dat (in Custom Data, or X-Plane's default navigation data): one line per
// airport with metadata the per-airport CIFP files don't carry, notably the airport's own transition altitude
// and transition level. X-Plane publishes no spec for this file; the columns below were confirmed against
// another source for the same cycle:
//
//   ICAO REGION LAT LON ELEVATION_FT USE LONGEST_RUNWAY_FT CODE TRANSITION_ALT TRANSITION_LEVEL
//
// USE is C civil, M military, P private or J joint. TRANSITION_LEVEL is `FLnnn`, feet, or -1 for none;
// TRANSITION_ALT is feet or -1. CODE (one character) is not read: its meaning isn't documented.
// The file starts with an `I` line and a version line and ends with `99`.
const INT = /^-?\d+$/;
const NUM = /^-?\d+(\.\d+)?$/;
function feetOrNone(s) {
    if (s === '-1')
        return null;
    if (INT.test(s))
        return Number(s);
    const fl = /^FL(\d+)$/.exec(s);
    return fl === null ? undefined : Number(fl[1]) * 100;
}
/** earth_aptmeta.dat as a map from ICAO id. Never throws: lines that don't fit the layout are left out. */
export function parseAptMeta(text) {
    const out = new Map();
    for (const line of text.split(/\r?\n/)) {
        const p = line.trim().split(/\s+/);
        if (p.length !== 10)
            continue;
        const [id, region, lat, lon, elev, use, longest, , ta, tl] = p;
        if (!NUM.test(lat) || !NUM.test(lon) || !INT.test(elev) || !INT.test(longest) || !/^[CMPJ]$/.test(use))
            continue;
        const transitionAltitudeFt = feetOrNone(ta);
        const transitionLevelFt = feetOrNone(tl);
        if (transitionAltitudeFt === undefined || transitionLevelFt === undefined)
            continue;
        out.set(id, {
            region, lat: Number(lat), lon: Number(lon), elevationFt: Number(elev), use: use,
            longestRunwayFt: Number(longest), transitionAltitudeFt, transitionLevelFt,
        });
    }
    return out;
}
