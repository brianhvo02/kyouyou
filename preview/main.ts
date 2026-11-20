// The family kit preview (dev only, not shipped): `npx vite preview/` from the package root.
// The kit's CSS is imported here, not linked from the page: Vite resolves these paths from the file,
// and they sit outside the preview's root.
import '../src/style/fonts.css';
import '../src/style/tokens.css';
import '../src/style/base.css';
import './preview.css';
import {defineFamilyBar, FAMILY, type FamilyBarMode} from '../src/family-bar/family-bar.ts';

defineFamilyBar();

type Theme = 'os' | 'light' | 'dark';

function make(tag: string, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

// The bar for every member, in each mode.
for (const host of document.querySelectorAll<HTMLElement>('[data-bars]')) {
  const mode = host.dataset.bars as FamilyBarMode;
  for (const m of FAMILY) {
    host.append(make('div', {class: 'bar-row'},
      make('code', {}, `current="${m.id}" mode="${mode}"`),
      make('kk-family-bar', {current: m.id, mode}),
    ));
  }
}

// Swatches: the token name and the value it resolves to in the current theme.
const PALETTE = ['chart-paper', 'chart-ink', 'chart-rule', 'sign-yellow', 'sign-black'];
const THEMED = ['ground', 'surface', 'ink', 'ink-muted', 'rule', 'rule-strong'];
const valueNodes: [string, HTMLElement][] = [];

function swatch(name: string): HTMLElement {
  const value = make('span', {class: 'value kk-figures'});
  valueNodes.push([`--kk-${name}`, value]);
  return make('li', {class: 'swatch'},
    make('span', {class: 'chip', style: `background: var(--kk-${name})`}),
    make('code', {}, `--kk-${name}`), value);
}

for (const host of document.querySelectorAll<HTMLElement>('[data-swatches]')) {
  for (const name of host.dataset.swatches === 'palette' ? PALETTE : THEMED) host.append(swatch(name));
}

const accents = document.querySelector<HTMLElement>('[data-accents]');
if (accents) {
  for (const m of FAMILY) {
    const value = make('span', {class: 'value kk-figures'});
    valueNodes.push([`--kk-${m.id}`, value]);
    accents.append(make('li', {class: 'accent', 'data-kk-accent': m.id},
      make('span', {class: 'fill'}, m.name, ' ', make('span', {class: 'kk-jp', lang: 'ja'}, m.kanji)),
      make('code', {}, `--kk-${m.id}`), value,
      make('span', {class: 'as-text'}, `${m.name} as text`),
    ));
  }
}

const primaries = document.querySelector<HTMLElement>('[data-primaries]');
if (primaries) {
  for (const m of FAMILY) {
    primaries.append(make('button', {class: 'kk-button-primary', 'data-kk-accent': m.id}, `Open ${m.name}`));
  }
}

// The type scale, from the tokens.
const SCALE: [string, string][] = [
  ['4', 'Page titles'], ['3', 'Page titles on phones'], ['2', 'Section titles'],
  ['1', 'Panel titles'], ['0', 'Body text'], ['-1', 'Secondary text'], ['-2', 'Fine print under figures'],
];
const scale = document.querySelector<HTMLElement>('[data-scale]');
if (scale) {
  for (const [step, use] of SCALE) {
    const size = make('span', {class: 'value kk-figures'});
    valueNodes.push([`--kk-step-${step}`, size]);
    scale.append(make('li', {},
      make('span', {class: 'meta'}, make('code', {}, `--kk-step-${step}`), size),
      make('span', {class: 'sample', style: `font-size: var(--kk-step-${step})`}, use),
    ));
  }
}

function refreshValues(): void {
  const style = getComputedStyle(document.documentElement);
  for (const [prop, node] of valueNodes) node.textContent = style.getPropertyValue(prop).trim();
}

// The theme switch: OS, light or dark, set on the root as the apps do. ?theme= picks it on load.
const frame = document.querySelector<HTMLIFrameElement>('.frame-700');

function applyTheme(theme: Theme): void {
  const roots = [document.documentElement, frame?.contentDocument?.documentElement];
  for (const root of roots) {
    if (!root) continue;
    if (theme === 'os') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }
  refreshValues();
}

function currentTheme(): Theme {
  const checked = document.querySelector<HTMLInputElement>('input[name="theme"]:checked');
  return (checked?.value as Theme | undefined) ?? 'os';
}

const asked = new URLSearchParams(location.search).get('theme');
if (asked === 'light' || asked === 'dark' || asked === 'os') {
  const input = document.querySelector<HTMLInputElement>(`input[name="theme"][value="${asked}"]`);
  if (input) input.checked = true;
}

for (const input of document.querySelectorAll<HTMLInputElement>('input[name="theme"]')) {
  input.addEventListener('change', () => applyTheme(currentTheme()));
}
frame?.addEventListener('load', () => applyTheme(currentTheme()));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshValues);
applyTheme(currentTheme());
