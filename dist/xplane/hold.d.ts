export interface Hold {
    ident: string;
    region: string;
    /** The airport a terminal hold belongs to; null for ENRT. */
    airport: string | null;
    fixType: number;
    inboundCourseDeg: number;
    legTimeMin: number | null;
    legDistanceNm: number | null;
    turn: 'L' | 'R';
    minAltFt: number | null;
    maxAltFt: number | null;
    speedKt: number | null;
}
export declare function parseHolds(text: string): Hold[];
