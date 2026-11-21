/** A run of columns, 1-based and inclusive. */
export interface ColumnSpan {
    readonly start: number;
    readonly end: number;
}
/**
 * One named part of a record's identity. The names are the same across layouts: `area` the customer or
 * area code (2–4), `airport` the airport ident and `airportRegion` its ICAO region (11–12), `region` the
 * record's own ICAO region (a navaid's 20–21, an airspace's 7–8).
 */
export interface IdentityField extends ColumnSpan {
    readonly name: string;
}
/** Where a record's fields are, for the kinds `recordLayout` covers. */
export interface RecordLayout {
    /** The columns that name the thing the record describes (airport, region, procedure, ident and so on). */
    readonly identity: ReadonlyArray<IdentityField>;
    /** The sequence number, which renumbers when points are added or removed. */
    readonly sequence?: ColumnSpan;
    /** The continuation record number (0 or 1 on a primary record, 2 and up on continuations). */
    readonly continuation?: ColumnSpan;
    /** Several records share this identity and form an unordered list; compare them as a set. */
    readonly grouped?: true;
}
/** The column of the subsection code: 13 for airports (P) and heliports (H), 6 for the rest. See `subsectionOf` for PN. */
export declare function subsectionColumn(section: string): 6 | 13;
/** A record's subsection code (a blank is `' '`), terminal NDBs included (P with N at column 6). */
export declare function subsectionOf(record: string): string;
/** The plain name of a record kind, or null when unknown. A blank subsection may be `' '` or `''`. */
export declare function recordKindName(section: string, subsection: string): string | null;
/** Where the identity, sequence and continuation are for a record kind, or null for a kind not covered. */
export declare function recordLayout(section: string, subsection: string): RecordLayout | null;
