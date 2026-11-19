import type { LatLon } from '../geo/polygon.ts';
export type ControllerRole = 'ctr' | 'tracon' | 'twr';
export interface ControllerArea {
    floorFt: number;
    ceilingFt: number;
    ring: LatLon[];
}
export interface Controller {
    name: string;
    facilityId: string;
    role: ControllerRole;
    /**
     * Frequencies in kHz, without duplicates: FREQ converted from tens of kHz (25 kHz channels completed,
     * 12347 -> 123475); CHAN kept as written, an 8.33 kHz channel name such as 132005, not the true frequency.
     */
    khz: number[];
    areas: ControllerArea[];
    /** Towers: the airport. */
    icao?: string;
    /** Towers: the airport's transition altitude. */
    transitionAltitudeFt?: number;
    /** Towers: the airspace class, A–G. */
    airspaceClass?: string;
}
export interface ControllerAt extends Omit<Controller, 'areas'> {
    floorFt: number;
    ceilingFt: number;
}
/** A frequency in tens of kHz, in kHz: one ending in 2 or 7 is the 25 kHz channel it was cut from (12347 -> 123475). */
export declare function tenKhzToKhz(value: number): number;
/** The controllers in atc.dat text, in file order. */
export declare function parseAtc(text: string): Controller[];
/**
 * Controllers with an area that contains the point and whose floor <= altFt <= ceiling, each with that
 * area's floor and ceiling. Order: twr, then tracon, then ctr.
 */
export declare function controllersAt(all: readonly Controller[], lat: number, lon: number, altFt: number): ControllerAt[];
