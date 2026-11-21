/** Where a record's fields are, for the kinds `recordLayout` covers. */
export interface RecordLayout {
    /** The columns that name the thing the record describes (airport, region, procedure, ident and so on). */
    identity: ReadonlyArray<{
        name: string;
        start: number;
        end: number;
    }>;
    /** The sequence number, which renumbers when points are added or removed. */
    sequence?: {
        start: number;
        end: number;
    };
    /** The continuation record number (0 or 1 on a primary record, 2 and up on continuations). */
    continuation?: {
        start: number;
        end: number;
    };
}
/** The column of the subsection code: 13 for airports (P) and heliports (H), 6 for the rest. See `subsectionOf` for PN. */
export declare function subsectionColumn(section: string): 6 | 13;
/** A record's subsection code (a blank is `' '`), terminal NDBs included (P with N at column 6). */
export declare function subsectionOf(record: string): string;
/** The plain name of a record kind, or null when unknown. A blank subsection may be `' '` or `''`. */
export declare function recordKindName(section: string, subsection: string): string | null;
/** Where the identity, sequence and continuation are for a record kind, or null for a kind not covered. */
export declare function recordLayout(section: string, subsection: string): RecordLayout | null;
