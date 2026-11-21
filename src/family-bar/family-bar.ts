/**
 * The Kyoten Kuukou family bar: a row of airfield taxiway signs along the top of every surface.
 * The surface you are on is the location sign (sign yellow on black, yellow frame); every other
 * member is a direction sign (black on sign yellow) with an arrow pointing along the row.
 *
 *   <kk-family-bar current="kouro" mode="public"></kk-family-bar>
 *
 * Attributes:
 * - current: kuukou | kouro | kokuzu | kansei | koho | kakunouko. Its sign is not a link (aria-current).
 * - mode: public (the default; each member's public address, Kakunouko hidden unless current) or
 *   home (served by Kakunouko: apps at ../<app>/, Kakunouko at ../, Kuukou the public dashboard).
 * - unavailable: space-separated members to hide (never the current one). The bar never probes.
 * - compact: only the location sign, which opens the others as a menu (for a host toolbar).
 *   Under 600 px of viewport every bar is shown this way.
 *
 * No framework; call defineFamilyBar() once before (or after) the element is in the page.
 * Its CSS is in the module and applied in its shadow root (see family-bar-css.ts).
 */
import {FAMILY_BAR_CSS} from './family-bar-css.ts';
import {placeMenu} from './place-menu.ts';

export type FamilyMemberId = 'kuukou' | 'kouro' | 'kokuzu' | 'kansei' | 'koho' | 'kakunouko';

/** A <kk-family-bar>. It is driven by its attributes; it adds no properties of its own. */
export interface FamilyBarElement extends HTMLElement {}

declare global {
  interface HTMLElementTagNameMap {
    'kk-family-bar': FamilyBarElement;
  }
}
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
export const FAMILY: readonly FamilyMember[] = [
  {id: 'kuukou', name: 'Kuukou', kanji: '拠点空港', publicUrl: 'https://kyotenkuukou.pages.dev/', homeHref: 'https://kyotenkuukou.pages.dev/'},
  {id: 'kouro', name: 'Kouro', kanji: '航路', publicUrl: 'https://kouro.pages.dev/', homeHref: '../kouro/'},
  {id: 'kokuzu', name: 'Kōkūzu', kanji: '航空図', publicUrl: 'https://kokuzu.pages.dev/', homeHref: '../kokuzu/'},
  {id: 'kansei', name: 'Kansei', kanji: '管制', publicUrl: 'https://kansei-atc.pages.dev/', homeHref: '../kansei/'},
  {id: 'koho', name: 'Kōhō', kanji: '航法', publicUrl: 'https://koho.pages.dev/', homeHref: '../koho/'},
  {id: 'kakunouko', name: 'Kakunouko', kanji: '格納庫', publicUrl: null, homeHref: '../'},
];

const TAG = 'kk-family-bar';
const NARROW = '(max-width: 599.98px)';
const MENU_ID = 'kk-family-menu';
const SVG = 'http://www.w3.org/2000/svg';
const ARROW = 'M1 6.25h8.5V1.5L15.5 8l-6 6.5V9.75H1z';
const CARET = 'M1.5 4.5h13L8 12z';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

function icon(className: string, path: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', path);
  svg.append(p);
  return svg;
}

/** The name and kanji of a sign. */
function label(m: FamilyMember): Node[] {
  return [el('span', {class: 'name'}, m.name), el('span', {class: 'kk-jp', lang: 'ja'}, m.kanji)];
}

let sheet: CSSStyleSheet | null | undefined;

/** One constructed stylesheet shared by every bar, or null where the browser has none. */
function sharedSheet(): CSSStyleSheet | null {
  if (sheet !== undefined) return sheet;
  sheet = null;
  try {
    if (typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype
      && typeof ShadowRoot !== 'undefined' && 'adoptedStyleSheets' in ShadowRoot.prototype) {
      const s = new CSSStyleSheet();
      s.replaceSync(FAMILY_BAR_CSS);
      sheet = s;
    }
  } catch {
    sheet = null;
  }
  return sheet;
}

function createElementClass(): CustomElementConstructor {
  return class FamilyBar extends HTMLElement {
    static observedAttributes = ['current', 'mode', 'unavailable', 'compact'];

    readonly #root: ShadowRoot;
    #narrow: MediaQueryList | null = null;
    #open = false;

    constructor() {
      super();
      this.#root = this.attachShadow({mode: 'open'});
      const s = sharedSheet();
      if (s) this.#root.adoptedStyleSheets = [s];
      else this.#root.append(el('style', {}, FAMILY_BAR_CSS));
      this.#root.addEventListener('keydown', this.#onKey);
      this.#root.addEventListener('focusout', this.#onFocusOut);
    }

    connectedCallback(): void {
      this.#narrow = typeof matchMedia === 'function' ? matchMedia(NARROW) : null;
      this.#narrow?.addEventListener('change', this.#onWidth);
      this.#render();
    }

    disconnectedCallback(): void {
      this.#narrow?.removeEventListener('change', this.#onWidth);
      this.#narrow = null;
      this.#setOpen(false);
    }

    attributeChangedCallback(): void {
      if (this.isConnected) this.#render();
    }

    get #current(): FamilyMember | undefined {
      const id = this.getAttribute('current');
      return FAMILY.find((m) => m.id === id);
    }

    get #mode(): FamilyBarMode {
      return this.getAttribute('mode') === 'home' ? 'home' : 'public';
    }

    get #collapsed(): boolean {
      return this.hasAttribute('compact') || this.#narrow?.matches === true;
    }

    /** The members on the bar, in order: the current one always, the rest unless hidden. */
    #members(): FamilyMember[] {
      const current = this.#current;
      const mode = this.#mode;
      const unavailable = new Set((this.getAttribute('unavailable') ?? '').split(/\s+/).filter(Boolean));
      return FAMILY.filter((m) => {
        if (m === current) return true;
        if (unavailable.has(m.id)) return false;
        return mode === 'home' || m.publicUrl !== null;
      });
    }

    #href(m: FamilyMember): string {
      return this.#mode === 'home' ? m.homeHref : m.publicUrl!;
    }

    #direction(m: FamilyMember, arrow: 'left' | 'right'): HTMLAnchorElement {
      const a = el('a', {class: 'sign direction', href: this.#href(m), 'data-member': m.id, 'data-arrow': arrow});
      const head = icon('arrow', ARROW);
      if (arrow === 'left') a.append(head, ...label(m));
      else a.append(...label(m), head);
      return a;
    }

    #render(): void {
      this.#setOpen(false);
      const current = this.#current;
      const members = this.#members();
      const at = current ? FAMILY.indexOf(current) : -1;
      const arrowFor = (m: FamilyMember): 'left' | 'right' => (FAMILY.indexOf(m) < at ? 'left' : 'right');

      const collapsed = this.#collapsed;
      const nav = el('nav', {class: collapsed ? 'strip folded' : 'strip', 'aria-label': 'Kyoten Kuukou apps'});
      if (!collapsed) {
        const array = el('ul', {class: 'array'});
        for (const m of members) {
          const sign = m === current
            ? el('span', {class: 'sign location', 'data-member': m.id, 'aria-current': 'page'}, ...label(m))
            : this.#direction(m, arrowFor(m));
          array.append(el('li', {}, sign));
        }
        nav.append(array);
      } else {
        const button = el('button', {
          type: 'button',
          class: 'sign location toggle',
          'aria-expanded': 'false',
          'aria-controls': MENU_ID,
        });
        if (current) {
          button.setAttribute('aria-current', 'page');
          button.setAttribute('data-member', current.id);
          button.append(...label(current));
        } else {
          button.append(el('span', {class: 'name'}, 'Kyoten Kuukou'));
        }
        button.append(el('span', {class: 'visually-hidden'}, ', other apps'), icon('caret', CARET));
        button.addEventListener('click', () => this.#setOpen(!this.#open));
        const menu = el('ul', {class: 'menu', id: MENU_ID, hidden: ''});
        for (const m of members) if (m !== current) menu.append(el('li', {}, this.#direction(m, arrowFor(m))));
        nav.append(el('div', {class: 'collapsed'}, el('div', {class: 'array'}, button), menu));
      }
      const old = this.#root.querySelector('nav');
      if (old) old.replaceWith(nav);
      else this.#root.append(nav);
    }

    #setOpen(open: boolean): void {
      if (open === this.#open) return;
      this.#open = open;
      const button = this.#root.querySelector<HTMLButtonElement>('button.toggle');
      const menu = this.#root.querySelector<HTMLElement>('.menu');
      if (button && menu) {
        button.setAttribute('aria-expanded', String(open));
        menu.hidden = !open;
        if (open) this.#place(button, menu);
      }
      // While open, the bar rises above the page so its menu is never painted over.
      this.toggleAttribute('data-kk-open', open);
      // Escape is heard on the page too: Safari does not focus a button on click, so after a mouse
      // open the key never reaches the shadow root.
      if (open) {
        document.addEventListener('pointerdown', this.#onOutside, true);
        document.addEventListener('keydown', this.#onPageKey);
      } else {
        document.removeEventListener('pointerdown', this.#onOutside, true);
        document.removeEventListener('keydown', this.#onPageKey);
      }
    }

    /** Measures the just-shown menu and keeps it inside the viewport (see placeMenu). */
    #place(button: HTMLElement, menu: HTMLElement): void {
      menu.style.maxWidth = '';
      menu.style.minWidth = '';
      const width = menu.getBoundingClientRect().width;
      // The layout viewport without its scrollbar; innerWidth where there is no layout (jsdom).
      const viewport = document.documentElement.clientWidth || innerWidth;
      const {side, maxWidth} = placeMenu(button.getBoundingClientRect(), width, viewport);
      menu.dataset.side = side;
      menu.style.maxWidth = `${maxWidth}px`;
      if (width > maxWidth) menu.style.minWidth = '0';
    }

    #onWidth = (): void => {
      this.#render();
    };

    #onOutside = (e: Event): void => {
      if (!e.composedPath().includes(this)) this.#setOpen(false);
    };

    #onFocusOut = (e: Event): void => {
      const next = (e as FocusEvent).relatedTarget as Node | null;
      if (next && (next === this || this.contains(next) || this.#root.contains(next))) return;
      if (next) this.#setOpen(false);
    };

    #onPageKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !this.#open || e.defaultPrevented) return;
      e.preventDefault();
      this.#setOpen(false);
      this.#root.querySelector<HTMLButtonElement>('button.toggle')?.focus();
    };

    #onKey = (e: Event): void => {
      const k = (e as KeyboardEvent).key;
      const target = e.target as Element | null;
      if (k === 'Enter' && target?.matches('button.toggle')) {
        // Handled here; preventDefault stops the browser's own click, so it toggles once.
        e.preventDefault();
        this.#setOpen(!this.#open);
      } else if (k === 'Escape' && this.#open) {
        e.preventDefault();
        this.#setOpen(false);
        this.#root.querySelector<HTMLButtonElement>('button.toggle')?.focus();
      }
    };
  };
}

/** Registers <kk-family-bar> once; calling it again does nothing. Does nothing outside a browser. */
export function defineFamilyBar(): void {
  if (typeof customElements === 'undefined' || typeof HTMLElement === 'undefined') return;
  if (customElements.get(TAG)) return;
  customElements.define(TAG, createElementClass());
}
