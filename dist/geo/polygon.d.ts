export interface LatLon {
    lat: number;
    lon: number;
}
/**
 * True when the position is inside the ring. The ring need not repeat its first corner at the end, and
 * may run either way round. A position exactly on an edge may count as either side.
 */
export declare function pointInPolygon(lat: number, lon: number, ring: readonly LatLon[]): boolean;
