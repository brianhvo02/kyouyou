import type { Msa, RunwayEnd } from './types.ts';
import type { FixIndex } from './fixes.ts';
/**
 * The minimum safe altitudes of one airport from earth_msa.dat text. A row is
 * `<type> <centre> <region> <airport> <M|T> (<bearing> <alt/100> <radius>)* 000 000 <n>`.
 * A runway centre ('RW28L') is placed at that runway's threshold, else at the airport. A centre that is neither is left out.
 */
export declare function msaFor(airportId: string, msaText: string, fixes: FixIndex, airportLatLon: {
    lat: number;
    lon: number;
}, runways?: readonly RunwayEnd[]): Msa[];
