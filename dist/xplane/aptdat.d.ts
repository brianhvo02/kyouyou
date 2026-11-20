export interface AptDatRunwayEnd {
    ident: string;
    lat: number;
    lon: number;
    /** Displaced threshold, metres; null when unreadable. */
    displacedM: number | null;
}
export interface AptDatRunway {
    widthM: number | null;
    /** Surface code as written (1 asphalt, 2 concrete, 3 grass, …); null when unreadable. */
    surface: number | null;
    ends: AptDatRunwayEnd[];
}
export interface AptDatFrequency {
    /** The row code: 1050–1056, or 50–56 in older files. */
    code: number;
    mhz: number;
    name: string;
}
export interface AptDatAirport {
    kind: 'land' | 'sea' | 'heli';
    ident: string;
    name: string;
    elevationFt: number | null;
    /** Row 1302 key/value pairs, as written. */
    meta: Record<string, string>;
    /** Row 100 (land runways) only. */
    runways: AptDatRunway[];
    frequencies: AptDatFrequency[];
}
/** The airports in apt.dat text, one at a time. */
export declare function readAptDat(text: AsyncIterable<string>): AsyncGenerator<AptDatAirport>;
