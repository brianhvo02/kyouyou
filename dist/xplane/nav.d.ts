export type NavKind = 'ndb' | 'vor' | 'loc-ils' | 'loc' | 'gs' | 'om' | 'mm' | 'im' | 'dme-ils' | 'dme' | 'fpap' | 'gls' | 'ltp';
export interface Navaid {
    code: number;
    kind: NavKind;
    lat: number;
    lon: number;
    elevationFt: number;
    /** As written; unit depends on the row code (see the file header). */
    frequency: number;
    range: number;
    /** As written; meaning depends on the row code (see the file header). */
    value: number;
    ident: string;
    /** Terminal airport; null for ENRT. */
    airport: string | null;
    region: string;
    /** Rows 4–9 and 14–16: the runway; otherwise null. */
    runway: string | null;
    name: string;
}
export declare function parseNav(text: string): Navaid[];
