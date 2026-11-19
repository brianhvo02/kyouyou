import type { CifpLeg, CifpProcedure } from '../xplane/cifp.ts';
/** A leg's fields as read, trimmed except `descriptor` (its spaces are positions) and `altDesc`. */
export interface LegFields {
    seq: number;
    fix: string;
    region: string;
    pathTerm: string;
    descriptor: string;
    altDesc: string;
    alt1: string;
    alt2: string;
    /** Magnetic course in tenths of a degree. */
    course: string;
    speed: string;
}
export declare function makeLeg(f: LegFields): CifpLeg;
export interface ProcedureCollector {
    /** Adds a leg to its procedure (kind and name) and route (route type and transition name). */
    add(kind: CifpProcedure['kind'], name: string, routeType: string, routeName: string, leg: CifpLeg): void;
    /** The procedures in the order first seen, legs sorted by sequence and the missed approach marked. */
    finish(): CifpProcedure[];
}
export declare function procedureCollector(): ProcedureCollector;
/** Feet, or `FL240` (24,000). Anything else is null. */
export declare function parseFeet(s: string): number | null;
/** ARINC 424 packed latitude `N/S DD MM SS ss` (9 chars). */
export declare function parseLat(s: string): number | undefined;
/** ARINC 424 packed longitude `E/W DDD MM SS ss` (10 chars). */
export declare function parseLon(s: string): number | undefined;
/** Elevation in feet, optionally signed; anything else is null. */
export declare function parseElevation(s: string): number | null;
