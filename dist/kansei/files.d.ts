export declare const STOCK_APT: readonly string[];
export declare const ATC_CANDIDATES: readonly (readonly string[])[];
/**
 * Airport files of an X-Plane folder, highest priority first: add-on packs in scenery_packs.ini order,
 * with the stock file where the ini lists `*GLOBAL_AIRPORTS*`, or last when the ini has no such line or
 * there is no ini. Only files that exist.
 */
export declare function findAptFiles(xplaneRoot: string): string[];
/** A navigation data file by name: `Custom Data` first, then `Resources/default data`. Null when neither has it. */
export declare function findDataFile(xplaneRoot: string, ...name: string[]): string | null;
/** The folder has CIFP procedure data: a `CIFP` folder in `Custom Data` or `Resources/default data`. */
export declare function hasCifp(xplaneRoot: string): boolean;
/** Reads an airport's CIFP file by id (`CIFP/<ID>.dat`), or null when there is none or the id is not a plain airport id. */
export declare function readCifpFrom(xplaneRoot: string): (id: string) => Promise<string | null>;
/** The X-Plane ATC file: `Custom Data` first, then the default scenery's. Null when neither exists. */
export declare function findAtcFile(xplaneRoot: string): string | null;
