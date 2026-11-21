import type { AirportProcedures } from './types.ts';
import type { FixIndex } from './fixes.ts';
/** The airport's procedures from the text of its CIFP file, with leg positions from the fix index. */
export declare function airportProcedures(id: string, cifpText: string, fixes: FixIndex, airport?: {
    lat: number;
    lon: number;
}): AirportProcedures;
