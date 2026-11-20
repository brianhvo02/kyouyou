/**
 * The family bar's stylesheet, applied inside its shadow root (a constructed stylesheet where the
 * browser has them, a <style> element otherwise). It lives in the module, so the bar needs no CSS
 * loader and loads nothing from any origin.
 *
 * Custom properties inherit through the shadow boundary, so the themed tokens (--kk-ground,
 * --kk-rule, --kk-surface…) follow the app's root data-theme and the OS setting exactly as
 * tokens.css says. The signs themselves are physical colours and look the same in both themes, as
 * real airfield signs do. Every var() carries the light value as a fallback, so a page without
 * tokens.css still gets a whole bar. The faces come from fonts.css on the page: @font-face does not
 * work inside a shadow root.
 */
export const FAMILY_BAR_CSS = `
:host {
  --bar-h: var(--kk-bar-height, 1.875rem);
  --yellow: var(--kk-sign-yellow, #f2c500);
  --black: var(--kk-sign-black, #000);
  display: block;
  position: relative;
  z-index: 50;
  font-family: var(--kk-font-text, system-ui, sans-serif);
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
:host([hidden]) { display: none; }
:host([data-kk-open]) { z-index: 1000; }
:host([compact]) { display: inline-block; vertical-align: middle; }

*, *::before, *::after { box-sizing: border-box; }

/* The strip: a band of ground under the sign array, ruled off from the page. */
.strip {
  display: flex;
  align-items: stretch;
  height: var(--bar-h);
  padding-inline: var(--kk-space-2, 0.5rem);
  background: var(--kk-ground, #eef1ec);
  border-bottom: 1px solid var(--kk-rule, #c9d0c8);
  overflow-x: auto;
  scrollbar-width: none;
}
.strip::-webkit-scrollbar { display: none; }
/* Folded to the location sign: nothing to scroll, and the menu must hang below the strip. */
.strip.folded { overflow: visible; }
:host([compact]) .strip {
  height: var(--bar-h);
  padding: 0;
  background: none;
  border: 0;
  overflow: visible;
}

/* The array: signs mounted side by side on one black panel, as on the airfield. */
.array {
  display: flex;
  gap: 2px;
  margin: 0;
  padding: 2px;
  list-style: none;
  background: var(--black);
  border-radius: var(--kk-radius-sign, 2px);
}
.array > li { display: flex; }

.sign {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0 0.5rem;
  border: 0;
  border-radius: 1px;
  font: inherit;
  font-size: var(--kk-step--1, 0.8125rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.01em;
  white-space: nowrap;
  text-decoration: none;
}
.kk-jp {
  font-family: var(--kk-font-jp, 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif CJK JP', serif);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}

/* Direction signs: black on sign yellow, the arrow on the side of the way to go. */
.direction {
  background: var(--yellow);
  color: var(--black);
}
.arrow {
  flex: none;
  width: 0.875em;
  height: 0.875em;
  fill: currentColor;
  transition: transform 120ms ease-out;
}
.direction[data-arrow="left"] .arrow { transform: scaleX(-1); }
a.direction:hover .name {
  text-decoration: underline 2px;
  text-underline-offset: 0.18em;
}
a.direction:hover[data-arrow="right"] .arrow { transform: translateX(2px); }
a.direction:hover[data-arrow="left"] .arrow { transform: scaleX(-1) translateX(2px); }
a.direction:focus-visible {
  outline: var(--kk-focus-width, 2px) solid var(--kk-focus-inner, #000);
  outline-offset: -4px;
}

/* The location sign: sign yellow on black inside a yellow frame. */
.location {
  padding-inline: 0.625rem;
  background: var(--black);
  color: var(--yellow);
  box-shadow: inset 0 0 0 2px var(--black), inset 0 0 0 4px var(--yellow);
}

/* Collapsed: the location sign is a button that opens the others. */
button.location { cursor: pointer; }
button.location:focus-visible {
  outline: var(--kk-focus-width, 2px) solid var(--kk-focus-outer, #f2c500);
  outline-offset: 4px;
  box-shadow: inset 0 0 0 2px var(--black), inset 0 0 0 4px var(--yellow), 0 0 0 4px var(--black);
}
.caret {
  flex: none;
  width: 0.625rem;
  height: 0.625rem;
  margin-inline-start: 0.125rem;
  fill: currentColor;
  transition: transform 120ms ease-out;
}
button[aria-expanded="true"] .caret { transform: rotate(180deg); }

.collapsed { position: relative; display: flex; }
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* The menu: the other signs stacked on a black panel, tall enough for a finger. */
.menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 13rem;
  max-width: calc(100vw - 1rem);
  margin: 0;
  padding: 2px;
  list-style: none;
  background: var(--black);
  border-radius: var(--kk-radius-sign, 2px);
  outline: 1px solid var(--kk-rule-strong, #77847e);
  animation: drop 120ms ease-out;
}
.menu[hidden] { display: none; }
.menu > li { display: flex; }
.menu .sign {
  flex: 1;
  min-height: 2.75rem;
  padding-inline: 0.75rem;
  font-size: var(--kk-step-0, 0.9375rem);
}
.menu .kk-jp { font-size: 0.875rem; }
.menu .direction[data-arrow="right"] .arrow { margin-inline-start: auto; }

@keyframes drop {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}

/* Between phone width and the full strip, the direction signs drop their kanji to fit. */
@media (max-width: 760px) {
  .array .direction .kk-jp { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .arrow, .caret { transition: none; }
  .menu { animation: none; }
}

@media (forced-colors: active) {
  .sign { border: 1px solid CanvasText; }
  .location { box-shadow: none; border-width: 3px; }
}
`;
