export interface CifpAlt {
    kind: 'at' | 'at-or-above' | 'at-or-below' | 'between';
    ft: number;
    lowerFt?: number;
    /** Descriptions G and H: the glide slope altitude at this fix (the second altitude). */
    glideSlopeFt?: number;
    /** Descriptions I and J: the glide slope intercept altitude (the second altitude). */
    glideSlopeInterceptFt?: number;
}
export type FixRole = 'IAF' | 'IF' | 'FAF' | 'MAP' | null;
export interface CifpLeg {
    seq: number;
    fix: string;
    region: string;
    pathTerm: string;
    alt: CifpAlt | null;
    speedKt: number | null;
    courseDeg: number | null;
    /** The course is true, not magnetic: written `dddT` in whole degrees (used at high latitudes). */
    courseTrue: boolean;
    /** Field 8 as written, e.g. 'EE B'. */
    descriptor: string;
    /** From descriptor position 4: A, C, D -> IAF; B -> IF; F -> FAF; M -> MAP; else null. */
    role: FixRole;
    /** Descriptor position 2 is 'Y'. */
    flyOver: boolean;
    /** Approaches: true from the first leg whose descriptor position 3 is 'M' to the end of the route. */
    missed: boolean;
}
export interface CifpRoute {
    name: string;
    /** Field 1 as written (ARINC 424 route type). */
    routeType: string;
    legs: CifpLeg[];
}
export interface CifpProcedure {
    kind: 'sid' | 'star' | 'approach';
    name: string;
    routes: CifpRoute[];
    /** Approaches only, from the name: I -> ILS, L -> LOC, R -> RNAV, H -> RNP, else other; runway '24R' from 'I24R'/'R06LY'; variant 'Y'. */
    approachType?: 'ILS' | 'LOC' | 'RNAV' | 'RNP' | 'other';
    runway?: string;
    variant?: string;
}
export interface CifpRunway {
    ident: string;
    lat: number;
    lon: number;
    /** Landing threshold elevation, RWY field 3. */
    elevationFt: number | null;
}
export interface CifpSkipped {
    line: number;
    reason: string;
}
export interface CifpAirport {
    runways: CifpRunway[];
    procedures: CifpProcedure[];
    transitionAltitudeFt: number | null;
    skipped: CifpSkipped[];
}
/** Never throws. Rows it cannot read are skipped. */
export declare function parseCifp(text: string): CifpAirport;
