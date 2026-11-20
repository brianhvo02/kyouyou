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
