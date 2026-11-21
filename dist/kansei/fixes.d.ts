type Point = {
    lat: number;
    lon: number;
};
/** `airport` is the terminal area the fix belongs to (an approach fix name can repeat at other airports in one region). */
export interface FixIndex {
    find(ident: string, region: string, airport?: string): Point | null;
}
/** earth_fix rows (`lat lon ident area region ...`) and earth_nav rows of codes 2, 3, 12 and 13 (`code lat lon elev freq range var ident area region ...`). */
export declare function indexFixes(fixText: string, navText: string): FixIndex;
export {};
