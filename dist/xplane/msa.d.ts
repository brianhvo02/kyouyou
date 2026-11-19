export interface MsaSector {
    bearingDeg: number;
    altitudeFt: number;
    radiusNm: number;
}
export interface Msa {
    pointType: number;
    ident: string;
    region: string;
    airport: string;
    bearingRef: 'M' | 'T';
    sectors: MsaSector[];
}
export declare function parseMsa(text: string): Msa[];
