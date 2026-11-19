import type { LatLon } from '../geo/polygon.ts';
export interface AirspaceLimit {
    ft: number;
    ref: 'MSL' | 'GND';
}
export interface Airspace {
    /** As written after AC: A–G, CTR, R, Q, P, … */
    class: string;
    name: string;
    floor: AirspaceLimit;
    ceiling: AirspaceLimit;
    /** Corners in file order; the first is not repeated at the end. */
    ring: LatLon[];
}
/** The areas in airspace.txt text, in file order. */
export declare function parseAirspaces(text: string): Airspace[];
/**
 * Treat areas as read-only once queried: their bounding boxes are cached.
 *
 * The areas that contain the position and, when `altFt` is given, whose floor ≤ altFt ≤ ceiling. GND
 * counts as 0 ft MSL (no terrain correction).
 */
export declare function airspacesAt(airspaces: readonly Airspace[], lat: number, lon: number, altFt?: number): Airspace[];
