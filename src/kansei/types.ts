// Moved from Kansei's helper (stage-2b-voice).
export type FreqRole = 'atis' | 'unicom' | 'clearance' | 'ground' | 'tower' | 'approach' | 'departure';
export interface AirportFreq { role: FreqRole; khz: number; name: string }
export interface RunwayEnd { name: string; lat: number; lon: number }
export interface Runway { widthM: number; ends: [RunwayEnd, RunwayEnd] }
export interface Airport {
  id: string; icao?: string; name: string; elevationFt: number;
  lat: number; lon: number; frequencies: AirportFreq[]; runways: Runway[];
}
export interface AirportSummary { id: string; name: string; lat: number; lon: number; hasTower: boolean; distanceNm?: number }
export type ControllerRole = 'ctr' | 'tracon' | 'twr';
export interface LatLon { lat: number; lon: number }
export interface ControllerArea { floorFt: number; ceilingFt: number; ring: LatLon[] }
export interface Controller { name: string; facilityId: string; role: ControllerRole; khz: number[]; areas: ControllerArea[] }
export type ControllerSummary = Omit<Controller, 'areas'>;
export interface HelperStatus { ok: true; airports: number; controllers: number }

export interface AltConstraint { kind: 'at' | 'at-or-above' | 'at-or-below' | 'between'; ft: number; /** 'between' only: the lower bound; ft is the upper. */ lowerFt?: number }
export interface ProcLeg { fix: string | null; lat: number | null; lon: number | null; pathTerm: string; alt: AltConstraint | null; speedKt: number | null; /** The published magnetic course, degrees, when the leg has one. */ courseDeg: number | null }
export interface ProcRoute { /** Transition ident, or the runway ('28L') or 'ALL' for the common part. */ name: string; legs: ProcLeg[] }
export type ApproachType = 'ILS' | 'LOC' | 'RNAV' | 'RNP' | 'other';
export interface Procedure {
  kind: 'sid' | 'star' | 'approach'; name: string;
  /** Approaches only. */ approachType?: ApproachType; runway?: string; variant?: string;
  common: ProcRoute[]; transitions: ProcRoute[];
}
export interface AirportProcedures { id: string; transitionAltitudeFt: number | null; procedures: Procedure[]; runways: RunwayEnd[] }
export interface MsaSector { fromDeg: number; ft: number; radiusNm: number }
export interface Msa { centre: string; lat: number; lon: number; magnetic: boolean; sectors: MsaSector[] }
export interface ControllerAt extends ControllerSummary { floorFt: number; ceilingFt: number }
