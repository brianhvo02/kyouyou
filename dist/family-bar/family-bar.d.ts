export type FamilyMemberId = 'kuukou' | 'kouro' | 'kokuzu' | 'kansei' | 'kakunouko';
export type FamilyBarMode = 'public' | 'home';
export interface FamilyMember {
    readonly id: FamilyMemberId;
    /** The romanised name, as shown on the sign. */
    readonly name: string;
    /** The Japanese name. */
    readonly kanji: string;
    /** The public address, or null (Kakunouko runs only on the owner's own machine). */
    readonly publicUrl: string | null;
    /** The link in home mode, relative to an app served at /<app>/. */
    readonly homeHref: string;
}
/** The family, in the bar's order. */
export declare const FAMILY: readonly FamilyMember[];
/** Registers <kk-family-bar> once; calling it again does nothing. Does nothing outside a browser. */
export declare function defineFamilyBar(): void;
