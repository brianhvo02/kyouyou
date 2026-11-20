// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {FAMILY, defineFamilyBar, placeMenu} from './family-bar.ts';
import {FAMILY_BAR_CSS} from './family-bar-css.ts';

/** A stand-in for window.matchMedia whose answer the test sets and changes. */
function fakeWidth(narrow: boolean): {set(narrow: boolean): void} {
  const listeners = new Set<(e: {matches: boolean}) => void>();
  const query = {
    matches: narrow,
    media: '',
    addEventListener: (_: string, fn: (e: {matches: boolean}) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: {matches: boolean}) => void) => listeners.delete(fn),
  };
  vi.stubGlobal('matchMedia', (media: string) => ({...query, media, get matches() { return query.matches; }}));
  return {
    set(next: boolean): void {
      query.matches = next;
      for (const fn of listeners) fn({matches: next});
    },
  };
}

function bar(attrs: Record<string, string>): HTMLElement {
  const el = document.createElement('kk-family-bar');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.append(el);
  return el;
}

const root = (el: HTMLElement): ShadowRoot => el.shadowRoot!;
const signs = (el: HTMLElement): HTMLElement[] => [...root(el).querySelectorAll<HTMLElement>('.sign')];
const shown = (el: HTMLElement): HTMLElement[] => signs(el).filter((s) => !s.closest('[hidden]'));
const names = (list: HTMLElement[]): string[] => list.map((s) => s.querySelector('.name')!.textContent!);
const link = (el: HTMLElement, id: string): string | null =>
  root(el).querySelector<HTMLAnchorElement>(`a.sign[data-member="${id}"]`)?.getAttribute('href') ?? null;
const toggle = (el: HTMLElement): HTMLButtonElement | null => root(el).querySelector('button.toggle');
const menu = (el: HTMLElement): HTMLElement => root(el).querySelector<HTMLElement>('.menu')!;
const key = (target: Element, k: string): boolean =>
  target.dispatchEvent(new KeyboardEvent('keydown', {key: k, bubbles: true, composed: true, cancelable: true}));

beforeEach(() => {
  fakeWidth(false);
  defineFamilyBar();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('defineFamilyBar', () => {
  test('registers kk-family-bar once and is safe to call again', () => {
    expect(customElements.get('kk-family-bar')).toBeDefined();
    expect(() => defineFamilyBar()).not.toThrow();
  });
});

describe('the signs', () => {
  test('five signs in order, each with its name and kanji marked as Japanese', () => {
    const el = bar({current: 'kouro', mode: 'home'});
    expect(names(shown(el))).toEqual(['Kuukou', 'Kouro', 'Kōkūzu', 'Kansei', 'Kakunouko']);
    const kanji = shown(el).map((s) => s.querySelector('.kk-jp')!);
    expect(kanji.map((k) => k.textContent)).toEqual(['拠点空港', '航路', '航空図', '管制', '格納庫']);
    expect(kanji.every((k) => k.getAttribute('lang') === 'ja')).toBe(true);
    expect(FAMILY.map((m) => m.id)).toEqual(['kuukou', 'kouro', 'kokuzu', 'kansei', 'kakunouko']);
  });

  test('sits in a labelled navigation landmark', () => {
    const el = bar({current: 'kouro'});
    expect(root(el).querySelector('nav')?.getAttribute('aria-label')).toBe('Kyoten Kuukou apps');
  });

  test('the current member is the location sign: aria-current, not a link', () => {
    const el = bar({current: 'kansei', mode: 'public'});
    const here = root(el).querySelectorAll('[aria-current="page"]');
    expect(here).toHaveLength(1);
    expect(here[0]!.classList.contains('location')).toBe(true);
    expect(here[0]!.tagName).not.toBe('A');
    expect(here[0]!.closest('a')).toBeNull();
    expect(link(el, 'kansei')).toBeNull();
    expect(names([here[0] as HTMLElement])).toEqual(['Kansei']);
  });

  test('direction signs point the way: arrows left before the location sign, right after it', () => {
    const el = bar({current: 'kokuzu', mode: 'public'});
    const dirs = shown(el).filter((s) => s.classList.contains('direction'));
    expect(dirs.map((s) => [s.dataset.member, s.dataset.arrow])).toEqual([
      ['kuukou', 'left'], ['kouro', 'left'], ['kansei', 'right'],
    ]);
    for (const s of dirs) expect(s.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('links', () => {
  test('public mode: each public address; Kakunouko hidden', () => {
    const el = bar({current: 'kouro', mode: 'public'});
    expect(link(el, 'kuukou')).toBe('https://kyotenkuukou.pages.dev/');
    expect(link(el, 'kokuzu')).toBe('https://kokuzu.pages.dev/');
    expect(link(el, 'kansei')).toBe('https://kansei-atc.pages.dev/');
    expect(names(shown(el))).toEqual(['Kuukou', 'Kouro', 'Kōkūzu', 'Kansei']);
    const fromKansei = bar({current: 'kansei', mode: 'public'});
    expect(link(fromKansei, 'kouro')).toBe('https://kouro.pages.dev/');
  });

  test('public is the default mode', () => {
    const el = bar({current: 'kouro'});
    expect(link(el, 'kansei')).toBe('https://kansei-atc.pages.dev/');
    expect(names(shown(el))).not.toContain('Kakunouko');
  });

  test('public mode shows Kakunouko when it is current', () => {
    const el = bar({current: 'kakunouko', mode: 'public'});
    expect(names(shown(el))).toEqual(['Kuukou', 'Kouro', 'Kōkūzu', 'Kansei', 'Kakunouko']);
    expect(root(el).querySelector('[aria-current="page"]')!.textContent).toContain('Kakunouko');
  });

  test('home mode: sibling paths, Kakunouko its home page, Kuukou the public dashboard', () => {
    const el = bar({current: 'kouro', mode: 'home'});
    expect(link(el, 'kuukou')).toBe('https://kyotenkuukou.pages.dev/');
    expect(link(el, 'kokuzu')).toBe('../kokuzu/');
    expect(link(el, 'kansei')).toBe('../kansei/');
    expect(link(el, 'kakunouko')).toBe('../');
    const fromHome = bar({current: 'kakunouko', mode: 'home'});
    expect(link(fromHome, 'kouro')).toBe('../kouro/');
  });

  test('home-mode paths resolve to siblings from /kouro/', () => {
    const base = 'http://home.example/kouro/';
    expect(new URL('../kokuzu/', base).pathname).toBe('/kokuzu/');
    expect(new URL('../', base).pathname).toBe('/');
  });
});

describe('unavailable members', () => {
  test('are hidden, in either mode', () => {
    const el = bar({current: 'kouro', mode: 'home', unavailable: 'kansei  kokuzu'});
    expect(names(shown(el))).toEqual(['Kuukou', 'Kouro', 'Kakunouko']);
    expect(link(el, 'kansei')).toBeNull();
  });

  test('never hide the current member', () => {
    const el = bar({current: 'kansei', mode: 'home', unavailable: 'kansei'});
    expect(names(shown(el))).toContain('Kansei');
  });
});

describe('attribute changes re-render', () => {
  test('current, mode and unavailable', () => {
    const el = bar({current: 'kouro', mode: 'public'});
    el.setAttribute('current', 'kokuzu');
    expect(root(el).querySelector('[aria-current="page"]')!.textContent).toContain('Kōkūzu');
    expect(link(el, 'kouro')).toBe('https://kouro.pages.dev/');
    el.setAttribute('mode', 'home');
    expect(link(el, 'kouro')).toBe('../kouro/');
    el.setAttribute('unavailable', 'kouro');
    expect(link(el, 'kouro')).toBeNull();
    el.removeAttribute('unavailable');
    expect(link(el, 'kouro')).toBe('../kouro/');
  });
});

describe('the collapsed bar (compact, or narrow)', () => {
  test('wide and not compact: every sign on the strip, no menu button', () => {
    const el = bar({current: 'kouro'});
    expect(toggle(el)).toBeNull();
  });

  test('compact: only the location sign, as a button that opens the others', () => {
    const el = bar({current: 'kouro', mode: 'home', compact: ''});
    const button = toggle(el)!;
    expect(button).not.toBeNull();
    expect(button.getAttribute('aria-current')).toBe('page');
    expect(button.textContent).toContain('Kouro');
    expect(button.querySelector('.kk-jp')!.textContent).toBe('航路');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(menu(el).hidden).toBe(true);
    expect(names(shown(el))).toEqual(['Kouro']);

    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(menu(el).hidden).toBe(false);
    expect(button.getAttribute('aria-controls')).toBe(menu(el).id);
    expect(names(shown(el))).toEqual(['Kouro', 'Kuukou', 'Kōkūzu', 'Kansei', 'Kakunouko']);
    expect(link(el, 'kansei')).toBe('../kansei/');

    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(menu(el).hidden).toBe(true);
  });

  test('Enter opens and closes; Escape closes and returns focus to the location sign', () => {
    const el = bar({current: 'kouro', compact: ''});
    const button = toggle(el)!;
    button.focus();
    expect(key(button, 'Enter')).toBe(false); // handled: no second toggle from the browser's click
    expect(menu(el).hidden).toBe(false);
    key(button, 'Enter');
    expect(menu(el).hidden).toBe(true);

    key(button, 'Enter');
    const first = menu(el).querySelector<HTMLAnchorElement>('a')!;
    first.focus();
    expect(root(el).activeElement).toBe(first);
    key(first, 'Escape');
    expect(menu(el).hidden).toBe(true);
    expect(root(el).activeElement).toBe(button);
  });

  test('a tap or click outside closes the menu', () => {
    const el = bar({current: 'kouro', compact: ''});
    toggle(el)!.click();
    document.body.dispatchEvent(new Event('pointerdown', {bubbles: true}));
    expect(menu(el).hidden).toBe(true);
  });

  test('focus leaving the bar closes the menu', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const el = bar({current: 'kouro', compact: ''});
    toggle(el)!.click();
    menu(el).querySelector('a')!.focus();
    outside.focus();
    expect(menu(el).hidden).toBe(true);
  });

  test('narrow width collapses every bar, and widening restores the strip', () => {
    const width = fakeWidth(true);
    const el = bar({current: 'kansei', mode: 'public'});
    expect(toggle(el)).not.toBeNull();
    expect(names(shown(el))).toEqual(['Kansei']);
    width.set(false);
    expect(toggle(el)).toBeNull();
    expect(names(shown(el))).toEqual(['Kuukou', 'Kouro', 'Kōkūzu', 'Kansei']);
    width.set(true);
    expect(toggle(el)).not.toBeNull();
  });

  test('removing compact restores the strip', () => {
    const el = bar({current: 'kouro', compact: ''});
    el.removeAttribute('compact');
    expect(toggle(el)).toBeNull();
  });
});

describe('the menu stays inside the viewport', () => {
  const MARGIN = 8;

  test('opens rightward from a host at the left edge', () => {
    expect(placeMenu({left: 8, right: 120}, 208, 320)).toEqual({side: 'start', maxWidth: 320 - 8 - MARGIN});
  });

  test('opens leftward from a compact host at the right edge of a 320 px toolbar', () => {
    expect(placeMenu({left: 210, right: 312}, 208, 320)).toEqual({side: 'end', maxWidth: 312 - MARGIN});
  });

  test('takes the roomier side, capped to it, when neither side fits whole', () => {
    expect(placeMenu({left: 100, right: 200}, 400, 320)).toEqual({side: 'start', maxWidth: 320 - 100 - MARGIN});
    expect(placeMenu({left: 150, right: 250}, 400, 320)).toEqual({side: 'end', maxWidth: 250 - MARGIN});
  });

  test('a right-edge compact bar at 320 px aligns its open menu to the right and caps its width', () => {
    vi.stubGlobal('innerWidth', 320);
    const el = bar({current: 'kansei', mode: 'home', compact: ''});
    const button = toggle(el)!;
    button.getBoundingClientRect = () => ({left: 210, right: 312, top: 0, bottom: 30, width: 102, height: 30, x: 210, y: 0, toJSON: () => ({})});
    menu(el).getBoundingClientRect = () => ({left: 210, right: 418, top: 34, bottom: 220, width: 208, height: 186, x: 210, y: 34, toJSON: () => ({})});
    button.click();
    expect(menu(el).dataset.side).toBe('end');
    expect(menu(el).style.maxWidth).toBe(`${312 - MARGIN}px`);
    button.click();
    vi.stubGlobal('innerWidth', 1280);
    button.click();
    expect(menu(el).dataset.side).toBe('start');
  });

  test('the stylesheet anchors an end-side menu to the right edge of the sign', () => {
    expect(FAMILY_BAR_CSS).toMatch(/\.menu\[data-side="end"\] \{ left: auto; right: 0; \}/);
  });
});

describe('the stylesheet', () => {
  test('loads nothing from anywhere: no url(), no @import', () => {
    expect(FAMILY_BAR_CSS).not.toMatch(/url\(|@import|https?:|\/\//);
  });

  test('takes its themed colours from the --kk- tokens, which follow the root data-theme', () => {
    expect(FAMILY_BAR_CSS).toContain('var(--kk-ground');
    expect(FAMILY_BAR_CSS).toContain('var(--kk-rule');
    expect(FAMILY_BAR_CSS).toContain('var(--kk-rule-strong');
  });

  test('a folded strip lets its menu hang below instead of clipping it', () => {
    fakeWidth(true);
    const el = bar({current: 'kouro'});
    expect(root(el).querySelector('nav')!.classList.contains('folded')).toBe(true);
    expect(FAMILY_BAR_CSS).toMatch(/\.strip\.folded \{ overflow: visible; \}/);
  });

  test('respects reduced motion', () => {
    expect(FAMILY_BAR_CSS).toContain('prefers-reduced-motion');
  });

  test('is in the shadow root', () => {
    const el = bar({current: 'kouro'});
    const sheets = root(el).adoptedStyleSheets?.length ?? 0;
    const styles = root(el).querySelectorAll('style').length;
    expect(sheets + styles).toBeGreaterThan(0);
  });
});
