export interface MoraGrid {
    /** MORA in feet for the cell whose lower-left corner is (latDeg, lonDeg); null when the file has none. */
    get(latDeg: number, lonDeg: number): number | null;
}
export declare function parseMora(text: string): MoraGrid;
/** MORA in feet at a position (the cell containing it), or null. */
export declare function moraAt(grid: MoraGrid, lat: number, lon: number): number | null;
