export interface AptMeta {
    region: string;
    lat: number;
    lon: number;
    elevationFt: number;
    use: 'C' | 'M' | 'P' | 'J';
    longestRunwayFt: number;
    /** The airport's transition altitude; null when the file has -1. */
    transitionAltitudeFt: number | null;
    /** The airport's transition level in feet (FL180 -> 18000); null when the file has -1. */
    transitionLevelFt: number | null;
}
/** earth_aptmeta.dat as a map from ICAO id. Never throws: lines that don't fit the layout are left out. */
export declare function parseAptMeta(text: string): Map<string, AptMeta>;
