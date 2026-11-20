import type { Airspace } from '../xplane/airspace.ts';
export interface RestrictiveAirspace extends Airspace {
    /** The restrictive type as written: R restricted, P prohibited, M MOA, W warning, A alert, D danger, T training, C caution, U unknown. */
    class: string;
    /** Columns 10–19, e.g. a made-up 'TEST1'. */
    designation: string;
    /** ICAO region, columns 7–8. */
    region: string;
    /** Column 20: tells apart areas that share a designation. */
    multipleCode: string;
    /** Column 27 as written, or null when blank. */
    timeCode: string | null;
    /** Column 28 as written, or null when blank. */
    notam: string | null;
    /** The limits as written, value and unit, e.g. 'GND A', '18000 M', 'FL180 M', 'UNLTD M', 'NOTSP', 'NOTAM'. */
    floorText: string;
    ceilingText: string;
}
export interface RestrictiveAirspaceSkipped {
    /** Line number of the area's first record. */
    line: number;
    reason: string;
}
export interface RestrictiveAirspaceResult {
    /** In the order first seen. */
    areas: RestrictiveAirspace[];
    skipped: RestrictiveAirspaceSkipped[];
}
/** Restrictive airspace areas in ARINC 424-18 lines. Takes lines, so a caller can stream; never throws. */
export declare function parseRestrictiveAirspace(lines: Iterable<string>): RestrictiveAirspaceResult;
