// Every shipped stylesheet must come through the CSS tool an app's bundler runs (Vite uses
// lightningcss) with every selector intact. Browsers and lightningcss read a selector list inside
// :where() forgivingly and drop what is invalid there (pseudo-elements, for one) without a word.
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {transform} from 'lightningcss';
import {describe, expect, test} from 'vitest';
import {FAMILY_BAR_CSS} from '../family-bar/family-bar-css.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** The four pseudo-elements that also have a legacy one-colon spelling. */
const LEGACY = /(^|[^:]):(before|after|first-line|first-letter)\b/g;

/**
 * The prelude of every style rule (at-rules left out), whitespace normalised, and with the
 * equivalent spellings lightningcss writes made one: `*::before` is `::before`, `:before` is `::before`.
 */
function selectors(css: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...clean.matchAll(/([^{};]+)\{/g)]
    .map((m) => m[1]!.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', '))
    .filter((s) => !s.startsWith('@'))
    .map((s) => s.replace(LEGACY, '$1::$2').replace(/\*(?=::)/g, ''));
}

function throughLightningcss(name: string, css: string): {code: string; warnings: string[]} {
  const out = transform({filename: name, code: Buffer.from(css), minify: false, errorRecovery: true});
  return {code: out.code.toString(), warnings: out.warnings.map((w) => w.message)};
}

const SHEETS: [string, () => string][] = [
  ['tokens.css', () => readFileSync(join(here, 'tokens.css'), 'utf8')],
  ['fonts.css', () => readFileSync(join(here, 'fonts.css'), 'utf8')],
  ['base.css', () => readFileSync(join(here, 'base.css'), 'utf8')],
  ['family-bar-css.ts', () => FAMILY_BAR_CSS],
];

describe('the kit survives lightningcss', () => {
  for (const [name, source] of SHEETS) {
    test(`${name}: every rule and selector comes through unchanged`, () => {
      const css = source();
      const {code, warnings} = throughLightningcss(name, css);
      expect(warnings).toEqual([]);
      expect(selectors(code)).toEqual(selectors(css));
    });
  }

  test('no pseudo-element inside :where() or :is(), where it would be dropped', () => {
    for (const [name, source] of SHEETS) {
      for (const s of selectors(source())) {
        expect.soft(s, name).not.toMatch(/:(where|is)\([^)]*::/);
      }
    }
  });
});
