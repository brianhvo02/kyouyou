export interface DatFile {
    /** The version number at the start of the second line, e.g. '1200'; '' if there is none. */
    version: string;
    /** The data rows, each split on whitespace; blank lines and everything from `99` on left out. */
    rows: string[][];
}
export declare function datRows(text: string): DatFile;
