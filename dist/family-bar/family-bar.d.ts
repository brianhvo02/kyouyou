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
/**
 * Which way the open menu hangs from the location sign, and how wide it may be, so it stays inside
 * the viewport wherever the host sits: rightward from the sign's left edge if it fits, else leftward
 * from its right edge, else on the roomier side, capped to that room.
 */
export declare function placeMenu(anchor: {
    readonly left: number;
    readonly right: number;
}, menuWidth: number, viewportWidth: number): {
    side: 'start' | 'end';
    maxWidth: number;
};
/** Registers <kk-family-bar> once; calling it again does nothing. Does nothing outside a browser. */
export declare function defineFamilyBar(): void;
