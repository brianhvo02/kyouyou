/** Great-circle distance in nautical miles (haversine). */
export declare function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number;
/** Initial true bearing in degrees, 0 to 360. */
export declare function initialBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number;
/** Candidate closest to the point, or undefined when there are none. */
export declare function nearest<T extends {
    lat: number;
    lon: number;
}>(cands: readonly T[], lat: number, lon: number): T | undefined;
/** Point a fraction (0 to 1) along the great circle from point 1 to point 2. */
export declare function intermediatePoint(lat1: number, lon1: number, lat2: number, lon2: number, fraction: number): {
    lat: number;
    lon: number;
};
