export type FmsPointKind = 'airport' | 'ndb' | 'vor' | 'fix';
export interface FmsPoint {
    ident: string;
    kind: FmsPointKind;
    lat: number;
    lon: number;
    /** How the point is reached: an airway name, DRCT, or ADEP / ADES for the two airports. */
    via: string;
    /** The altitude on the point's line, feet. Kouro writes 0 for the airports and the initial cruise altitude en route. */
    altitudeFt: number;
}
export interface FmsProcedure {
    name: string;
    /** Without the RW prefix: "28R". */
    runway?: string;
    transition?: string;
}
export interface FmsApproach {
    name: string;
    transition?: string;
}
export interface FmsPlan {
    origin: string;
    dest: string;
    cycle?: string;
    /** The runways, without the RW prefix, whether or not a procedure is named with them. */
    departureRunway?: string;
    arrivalRunway?: string;
    sid?: FmsProcedure;
    star?: FmsProcedure;
    /** X-Plane's own FMS writes the approach; Kouro does not. */
    approach?: FmsApproach;
    points: FmsPoint[];
    /** The airports among the points, each once, in order. */
    airports: string[];
    /** The highest altitude on any point, when one is above zero: the plan's initial cruise altitude. */
    cruiseAltitudeFt?: number;
}
/** A `.fms` file's text as a plan, or why it is not one. Never throws. */
export declare function parseFms(text: string): FmsPlan | {
    error: string;
};
/** A place on the route as the writer takes it. */
export interface FmsWritePoint {
    ident: string;
    kind: FmsPointKind;
    lat: number;
    lon: number;
}
export interface FmsWriteLeg extends FmsWritePoint {
    /** An airway name, DCT (or DRCT) for direct, or the name of the SID or STAR the leg belongs to. */
    via: string;
}
export interface FmsWritePlan {
    cycle: string;
    origin: FmsWritePoint;
    dest: FmsWritePoint;
    sid?: FmsProcedure;
    star?: FmsProcedure;
    /** Written on every en-route point; the airports get 0. There are no step climbs in the format. */
    cruiseAltitudeFt: number;
    /** Every leg between the airports, the procedures' legs included. */
    legs: readonly FmsWriteLeg[];
}
/**
 * `named` writes a SID or STAR as header lines and leaves its legs out (the FMC expands them), but only
 * when its runway is known, since X-Plane ignores a procedure without a runway; otherwise its legs are
 * written as direct waypoints. `waypoints` lists every leg, the procedures' as direct.
 */
export type FmsMode = 'named' | 'waypoints';
/** The plan as the text of an X-Plane 11/12 `.fms` file (v1100). Every line ends with a newline. */
export declare function writeFms(plan: FmsWritePlan, mode: FmsMode): string;
