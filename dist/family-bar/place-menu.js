// Internal to the family bar (not in the package's export map); a module of its own so the tests
// can reach it without it joining the public API.
/** Room kept between the open menu and the viewport's edges, in px. */
const EDGE = 8;
/**
 * Which way the open menu hangs from the location sign, and how wide it may be, so it stays inside
 * the viewport wherever the host sits: rightward from the sign's left edge if it fits, else leftward
 * from its right edge, else on the roomier side, capped to that room.
 */
export function placeMenu(anchor, menuWidth, viewportWidth) {
    const start = Math.max(0, viewportWidth - anchor.left - EDGE);
    const end = Math.max(0, anchor.right - EDGE);
    const side = menuWidth <= start || (menuWidth > end && start >= end) ? 'start' : 'end';
    return { side, maxWidth: side === 'start' ? start : end };
}
