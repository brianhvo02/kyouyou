import type { CifpAirport, CifpSkipped } from '../xplane/cifp.ts';
export interface FaaCifp {
    /** Keyed by the airport's ICAO id (columns 7–10), in the order first seen. */
    airports: Map<string, CifpAirport>;
    /** Airport records that belong to no airport (a blank airport id). */
    skipped: CifpSkipped[];
}
/**
 * The FAA's FAACIFP18 as airports keyed by ICAO id. Takes lines, so a caller can stream the file
 * (Node `readline`, say); a trailing CR is dropped. Never throws: unreadable records go in their airport's
 * `skipped`, or in the file-level `skipped` when they name no airport.
 */
export declare function parseFaaCifp(lines: Iterable<string>): FaaCifp;
