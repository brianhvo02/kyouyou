const EARTH_RADIUS_NM = 3440.065;
function toRad(deg) {
    return (deg * Math.PI) / 180;
}
/** Great-circle distance in nautical miles (haversine). */
export function distanceNm(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}
/** Initial true bearing in degrees, 0 to 360. */
export function initialBearingDeg(lat1, lon1, lat2, lon2) {
    const p1 = toRad(lat1);
    const p2 = toRad(lat2);
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
/** Candidate closest to the point, or undefined when there are none. */
export function nearest(cands, lat, lon) {
    let best;
    let bestDist = Infinity;
    for (const c of cands) {
        const d = distanceNm(lat, lon, c.lat, c.lon);
        if (d < bestDist) {
            bestDist = d;
            best = c;
        }
    }
    return best;
}
/** Point a fraction (0 to 1) along the great circle from point 1 to point 2. */
export function intermediatePoint(lat1, lon1, lat2, lon2, fraction) {
    const p1 = toRad(lat1);
    const l1 = toRad(lon1);
    const p2 = toRad(lat2);
    const l2 = toRad(lon2);
    const d = distanceNm(lat1, lon1, lat2, lon2) / EARTH_RADIUS_NM;
    if (d < 1e-12)
        return { lat: lat1, lon: lon1 };
    const a = Math.sin((1 - fraction) * d) / Math.sin(d);
    const b = Math.sin(fraction * d) / Math.sin(d);
    const x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2);
    const y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2);
    const z = a * Math.sin(p1) + b * Math.sin(p2);
    return {
        lat: (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI,
        lon: (Math.atan2(y, x) * 180) / Math.PI,
    };
}
