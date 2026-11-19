export interface Fix {
    ident: string;
    region: string;
    /** The airport a terminal fix belongs to; null for an enroute fix (ENRT). */
    airport: string | null;
    lat: number;
    lon: number;
    /** FIX1200's waypoint type, as written; null in 1101 or when absent. */
    type: number | null;
    /** FIX1200's name; null in 1101 or when absent. */
    name: string | null;
}
export declare function parseFix(text: string): Fix[];
