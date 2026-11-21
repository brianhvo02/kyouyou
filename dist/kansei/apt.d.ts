import type { Airport, AirportSummary } from './types.ts';
export interface AptIndexEntry extends AirportSummary {
    file: string;
    offset: number;
    length: number;
}
/** Scans one whole file once. Airports with no position (no runway and no datum) are indexed but have NaN lat/lon. */
export declare function indexApt(path: string): Promise<AptIndexEntry[]>;
/** Indexes several files, given highest priority first. When two files have the same airport id, the earlier file's airport is kept and the later one dropped. */
export declare function indexAptFiles(paths: readonly string[]): Promise<AptIndexEntry[]>;
/** Parses the text of one airport (its header row through its last row). Returns null if there is no header row. */
export declare function parseAirport(text: string): Airport | null;
/** Reads `entry.length` bytes at `entry.offset` of `entry.file` and parses them. */
export declare function readAirport(entry: AptIndexEntry): Promise<Airport | null>;
/** Entries within `nm` of the point, nearest first, at most `limit`, each with distanceNm rounded to 0.1. */
export declare function airportsNear(index: readonly AptIndexEntry[], lat: number, lon: number, nm: number, limit: number): AirportSummary[];
