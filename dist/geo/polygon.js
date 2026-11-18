// Whether a position lies inside an area given as a ring of latitude/longitude corners, as airspace
// and controller sectors are. The test is flat (longitude against latitude), which is how such files
// draw their edges; a ring may cross the antimeridian. A ring round a pole is not supported.
/** The longitude equivalent to `lon` that is nearest `near` (so 179 and -179 come out 2 apart, not 358). */
function nearLon(lon, near) {
    return near + ((((lon - near + 180) % 360) + 360) % 360) - 180;
}
/**
 * True when the position is inside the ring. The ring need not repeat its first corner at the end, and
 * may run either way round. A position exactly on an edge may count as either side.
 */
export function pointInPolygon(lat, lon, ring) {
    if (ring.length < 3)
        return false;
    // Unroll the ring so each corner's longitude follows the one before without a jump at the antimeridian.
    const lons = [];
    let prev = ring[0].lon;
    for (const c of ring) {
        prev = nearLon(c.lon, prev);
        lons.push(prev);
    }
    const min = Math.min(...lons);
    const max = Math.max(...lons);
    // The position's longitude in the same unrolled range, if it has an equivalent there.
    let x = nearLon(lon, (min + max) / 2);
    if (x < min)
        x += 360;
    if (x > max)
        x -= 360;
    if (x < min || x > max)
        return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const yi = ring[i].lat;
        const yj = ring[j].lat;
        const xi = lons[i];
        const xj = lons[j];
        if (yi > lat !== yj > lat && x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
            inside = !inside;
    }
    return inside;
}
