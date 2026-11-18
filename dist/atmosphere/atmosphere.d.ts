/** ISA atmosphere helpers (ICAO Doc 7488 standard atmosphere). */
/**
 * Pressure levels Open-Meteo serves for GFS. 350/450/550/650/750 hPa verified live on
 * 2026-11-08 (api.open-meteo.com/v1/gfs returned numbers for wind_speed_*, wind_direction_*
 * and temperature_* at each, over the full 16-day range, like 250 hPa).
 */
export declare const GFS_LEVELS_HPA: readonly number[];
/** ISA temperature in deg C at a geometric altitude in feet. */
export declare function isaTempC(altFt: number): number;
/** ISA static pressure in hPa at an altitude in feet. */
export declare function pressureHpa(altFt: number): number;
/** Open-Meteo GFS pressure level nearest the ISA pressure at FL x 100 ft. */
export declare function flToHpaLevel(fl: number): number;
/** True airspeed in knots for a Mach number at altitude and ISA deviation. */
export declare function machToTasKt(mach: number, altFt: number, isaDevC: number): number;
/** True airspeed in knots for a calibrated airspeed (compressible flow). */
export declare function casToTasKt(casKt: number, altFt: number, isaDevC: number): number;
