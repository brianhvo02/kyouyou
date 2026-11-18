/** The point `nm` from a point along the great circle that leaves it on `bearingDeg`. */
export declare function destinationPoint(lat: number, lon: number, bearingDeg: number, nm: number): {
    lat: number;
    lon: number;
};
/**
 * How far a position is to the side of the course through `fromLat, fromLon` on `courseDeg`, NM.
 * Positive is right of the course as flown, negative left.
 */
export declare function crossTrackNm(lat: number, lon: number, fromLat: number, fromLon: number, courseDeg: number): number;
/**
 * How far along the course through `fromLat, fromLon` on `courseDeg` a position is, NM, measured from
 * that point to the position's foot on the course. Negative when the position is behind the point.
 */
export declare function alongTrackNm(lat: number, lon: number, fromLat: number, fromLon: number, courseDeg: number): number;
