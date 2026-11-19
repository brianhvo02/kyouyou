/** A true direction as magnetic, 0 up to 360. */
export declare function trueToMagnetic(trueDeg: number, variationDeg: number): number;
/** A magnetic direction as true, 0 up to 360. */
export declare function magneticToTrue(magneticDeg: number, variationDeg: number): number;
/**
 * Magnetic declination (variation) in degrees, east positive, from NOAA's World Magnetic Model 2025, at a
 * geodetic position, a height above the WGS84 ellipsoid (feet, default 0) and a time (default now). The
 * model is valid 2025.0–2030.0; outside that it is extrapolated and grows less accurate. Unreliable within
 * about 1° of the geographic poles and near the magnetic poles, as any declination is.
 */
export declare function declination(lat: number, lon: number, altFt?: number, date?: Date): number;
