/**
 * Decoder for one GRIB2 message as NOAA publishes GFS 1-degree fields: a regular
 * 360 x 181 latitude/longitude grid (template 3.0), a forecast at one level
 * (template 4.0), simple packing (5.0) or complex packing with spatial
 * differencing (5.3), and no bitmap. Anything else is refused with undefined.
 */
export interface GribField {
    discipline: number;
    category: number;
    parameter: number;
    /** Type of first fixed surface (100 = isobaric, 103 = height above ground) and its value (Pa or m). */
    surfaceType: number;
    surfaceValue: number;
    forecastHours: number;
    /** Reference time, 'YYYY-MM-DDTHH:00'. */
    referenceUtc: string;
    nx: number;
    ny: number;
    /** Row-major, first row at 90°N, first column at 0°E, eastward; length nx * ny. */
    values: Float32Array;
}
/** Decodes one GRIB2 message; undefined for anything it does not fully support. */
export declare function decodeGrib2(bytes: Uint8Array): GribField | undefined;
