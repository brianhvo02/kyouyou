// Positions relative to a point and a course, on a sphere: where a bearing and distance lead, and how
// far a position is across and along a course. Plain numbers in, plain numbers out; degrees and
// nautical miles; bearings true.
import { distanceNm, initialBearingDeg } from "./geo.js";
const EARTH_RADIUS_NM = 3440.065;
const RAD = Math.PI / 180;
/** The point `nm` from a point along the great circle that leaves it on `bearingDeg`. */
export function destinationPoint(lat, lon, bearingDeg, nm) {
    const d = nm / EARTH_RADIUS_NM;
    const b = bearingDeg * RAD;
    const p1 = lat * RAD;
    const l1 = lon * RAD;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    // Longitude is brought back into -180..180.
    return { lat: p2 / RAD, lon: ((((l2 / RAD + 180) % 360) + 360) % 360) - 180 };
}
/**
 * How far a position is to the side of the course through `fromLat, fromLon` on `courseDeg`, NM.
 * Positive is right of the course as flown, negative left.
 */
export function crossTrackNm(lat, lon, fromLat, fromLon, courseDeg) {
    const d13 = distanceNm(fromLat, fromLon, lat, lon) / EARTH_RADIUS_NM;
    const t13 = initialBearingDeg(fromLat, fromLon, lat, lon) * RAD;
    return Math.asin(Math.sin(d13) * Math.sin(t13 - courseDeg * RAD)) * EARTH_RADIUS_NM;
}
/**
 * How far along the course through `fromLat, fromLon` on `courseDeg` a position is, NM, measured from
 * that point to the position's foot on the course. Negative when the position is behind the point.
 */
export function alongTrackNm(lat, lon, fromLat, fromLon, courseDeg) {
    const d13 = distanceNm(fromLat, fromLon, lat, lon) / EARTH_RADIUS_NM;
    if (d13 < 1e-12)
        return 0;
    const t13 = initialBearingDeg(fromLat, fromLon, lat, lon) * RAD;
    const off = t13 - courseDeg * RAD;
    const xt = Math.asin(Math.sin(d13) * Math.sin(off));
    const along = Math.acos(Math.min(1, Math.max(-1, Math.cos(d13) / Math.cos(xt)))) * EARTH_RADIUS_NM;
    return Math.cos(off) < 0 ? -along : along;
}
