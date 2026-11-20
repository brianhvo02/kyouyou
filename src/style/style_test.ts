import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {brotliDecompressSync} from 'node:zlib';
import {describe, expect, test} from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string): string => readFileSync(join(here, name), 'utf8');

/** The kanji of the family's names (拠点空港, 航路, 航空図, 管制, 格納庫, 共有), once each. */
const FAMILY_KANJI = [...new Set('拠点空港航路図管制格納庫共有')];

const ACCENTS = ['kuukou', 'kouro', 'kokuzu', 'kansei', 'kakunouko'] as const;

/** Properties that change with the theme: every dark selector defines each of them. */
const THEMED = ['--kk-ground', '--kk-surface', '--kk-ink', '--kk-ink-muted', '--kk-rule', '--kk-rule-strong', '--kk-accent-text'];

/** Everything the kit promises in tokens.css. */
const PROMISED = [
  ...THEMED,
  '--kk-chart-paper', '--kk-chart-ink', '--kk-chart-rule', '--kk-sign-yellow', '--kk-sign-black',
  ...ACCENTS.flatMap((a) => [`--kk-${a}`, `--kk-on-${a}`]),
  '--kk-accent', '--kk-accent-text', '--kk-on-accent',
  '--kk-font-text', '--kk-font-figures', '--kk-font-jp',
  '--kk-step--2', '--kk-step--1', '--kk-step-0', '--kk-step-1', '--kk-step-2', '--kk-step-3', '--kk-step-4',
  '--kk-leading', '--kk-leading-tight',
  '--kk-space-1', '--kk-space-2', '--kk-space-3', '--kk-space-4', '--kk-space-5', '--kk-space-6', '--kk-space-7',
  '--kk-radius-sign', '--kk-radius-control', '--kk-radius-panel',
  '--kk-focus-inner', '--kk-focus-outer', '--kk-focus-width', '--kk-focus-ring',
  '--kk-bar-height',
];

/** The declarations inside the first `{…}` that follows `selector` (nested braces allowed). */
function block(source: string, selector: string): Map<string, string> {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no block for ${selector}`);
  let i = css.indexOf('{', at) + 1;
  const start = i;
  for (let depth = 1; depth > 0; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') depth--;
  }
  const body = css.slice(start, i - 1);
  const props = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) props.set(m[1]!, m[2]!.trim().replace(/\s+/g, ' '));
  return props;
}

const tokens = (): string => read('tokens.css');
const light = (): Map<string, string> => block(tokens(), ':root');
const darkByOs = (): Map<string, string> => block(tokens(), ':root:not([data-theme="light"])');
const darkBySwitch = (): Map<string, string> => block(tokens(), ':root[data-theme="dark"]');

describe('tokens.css', () => {
  test('defines every promised property on :root', () => {
    const defined = light();
    expect(PROMISED.filter((p) => !defined.has(p))).toEqual([]);
  });

  test('defines every themed property in both dark selectors, with the same values', () => {
    const os = darkByOs();
    const sw = darkBySwitch();
    expect(THEMED.filter((p) => !os.has(p))).toEqual([]);
    expect(THEMED.filter((p) => !sw.has(p))).toEqual([]);
    expect(Object.fromEntries(sw)).toEqual(Object.fromEntries(os));
  });

  test('puts the OS dark block inside prefers-color-scheme: dark', () => {
    expect(tokens()).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{/);
  });

  test('keeps the palette from the design', () => {
    const t = light();
    expect(t.get('--kk-chart-paper')).toBe('#eef1ec');
    expect(t.get('--kk-chart-ink')).toBe('#18232e');
    expect(t.get('--kk-chart-rule')).toBe('#c9d0c8');
    expect(t.get('--kk-sign-yellow')).toBe('#f2c500');
    expect(t.get('--kk-sign-black')).toBe('#000');
    expect(t.get('--kk-kouro')).toBe('#c2189b');
    expect(t.get('--kk-kokuzu')).toBe('#0a7ea4');
    expect(t.get('--kk-kansei')).toBe('#1e8a4c');
    expect(t.get('--kk-kakunouko')).toBe('#c77700');
    expect(t.get('--kk-kuukou')).toBe('var(--kk-sign-yellow)');
    expect(t.get('--kk-accent')).toBe('var(--kk-kuukou)');
  });

  test('names the self-hosted faces first, and system Mincho before the subset', () => {
    const t = light();
    expect(t.get('--kk-font-text')).toMatch(/^'KK Macrons', 'KK B612',/);
    expect(t.get('--kk-font-figures')).toMatch(/^'KK B612 Mono',/);
    const jp = t.get('--kk-font-jp')!;
    expect(jp.indexOf("'Hiragino Mincho ProN'")).toBeGreaterThanOrEqual(0);
    expect(jp.indexOf("'Hiragino Mincho ProN'")).toBeLessThan(jp.indexOf("'KK Mincho'"));
    expect(jp.indexOf("'Yu Mincho'")).toBeLessThan(jp.indexOf("'KK Mincho'"));
    expect(jp).toMatch(/'KK Mincho', serif$/);
  });

  describe('nested accents', () => {
    const LIGHT_TEXT = 'oklch(from var(--kk-accent) min(l, 0.5) c h)';
    const DARK_TEXT = 'oklch(from var(--kk-accent) max(l, 0.75) c h)';

    test('works out accent text again wherever data-kk-accent sets the accent, in each theme', () => {
      expect(light().get('--kk-accent-text')).toBe(LIGHT_TEXT);
      expect(block(tokens(), ':where([data-kk-accent])').get('--kk-accent-text')).toBe(LIGHT_TEXT);
      expect(block(tokens(), ':where(:root:not([data-theme="light"]) [data-kk-accent])').get('--kk-accent-text')).toBe(DARK_TEXT);
      expect(block(tokens(), ':where(:root[data-theme="dark"] [data-kk-accent])').get('--kk-accent-text')).toBe(DARK_TEXT);
      expect(tokens()).toMatch(
        /@media \(prefers-color-scheme: dark\) \{\s*:where\(:root:not\(\[data-theme="light"\]\) \[data-kk-accent\]\) \{/,
      );
    });

    test('puts the dark rules after the light one, so they win at the same (zero) specificity', () => {
      const css = tokens().replace(/\/\*[\s\S]*?\*\//g, '');
      const lightAt = css.indexOf(':where([data-kk-accent]) {');
      expect(lightAt).toBeGreaterThan(0);
      expect(css.indexOf(':where(:root:not([data-theme="light"]) [data-kk-accent]) {')).toBeGreaterThan(lightAt);
      expect(css.indexOf(':where(:root[data-theme="dark"] [data-kk-accent]) {')).toBeGreaterThan(lightAt);
    });

    test('names each member as an accent: data-kk-accent="kouro" and the rest', () => {
      for (const a of ACCENTS) {
        const b = block(tokens(), `:where([data-kk-accent="${a}"])`);
        expect.soft(b.get('--kk-accent'), a).toBe(`var(--kk-${a})`);
        expect.soft(b.get('--kk-on-accent'), a).toBe(`var(--kk-on-${a})`);
      }
    });
  });
});

// ---- contrast -------------------------------------------------------------------------------

type Rgb = [number, number, number];

function hex(value: string): Rgb {
  const h = value.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb;
}
const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const luminance = (rgb: Rgb): number => {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
function toOklab(rgb: Rgb): Rgb {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklab([L, A, B]: Rgb): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186168 * m + 1.707614701 * s,
  ];
  return lin.map((c) => Math.min(1, Math.max(0, toGamma(c)))) as Rgb;
}

const toOklch = ([L, a, b]: Rgb): Rgb => [L, Math.hypot(a, b), Math.atan2(b, a)];
const fromOklch = ([L, C, h]: Rgb): Rgb => [L, C * Math.cos(h), C * Math.sin(h)];

/**
 * Resolves a token to a colour, following var(), `color-mix(in oklab, a P%, b)` and the relative
 * colour `oklch(from a min|max(l, N) c h)`. Out-of-gamut results are clipped, as browsers do.
 */
function resolve(theme: Map<string, string>, value: string): Rgb {
  const v = value.trim();
  if (v.startsWith('#')) return hex(v);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) return resolve(theme, theme.get(ref[1]!) ?? light().get(ref[1]!)!);
  const mix = /^color-mix\(in oklab, (.+) (\d+(?:\.\d+)?)%, (.+)\)$/.exec(v);
  if (mix) {
    const p = Number(mix[2]) / 100;
    const a = toOklab(resolve(theme, mix[1]!));
    const b = toOklab(resolve(theme, mix[3]!));
    return fromOklab(a.map((x, i) => x * p + b[i]! * (1 - p)) as Rgb);
  }
  const relative = /^oklch\(from (.+) (min|max)\(l, (\d+(?:\.\d+)?)\) c h\)$/.exec(v);
  if (relative) {
    const [L, C, h] = toOklch(toOklab(resolve(theme, relative[1]!)));
    const limit = Number(relative[3]);
    return fromOklab(fromOklch([relative[2] === 'min' ? Math.min(L, limit) : Math.max(L, limit), C, h]));
  }
  throw new Error(`cannot resolve ${value}`);
}

describe('contrast (WCAG 2)', () => {
  const themes = (): [string, Map<string, string>][] => [
    ['light', light()],
    ['dark', new Map([...light(), ...darkByOs()])],
  ];

  test('text tokens reach 4.5:1 on the ground and on surfaces', () => {
    for (const [name, t] of themes()) {
      const c = (fg: string, bg: string): number => contrast(resolve(t, `var(${fg})`), resolve(t, `var(${bg})`));
      for (const bg of ['--kk-ground', '--kk-surface']) {
        expect.soft(c('--kk-ink', bg), `${name} ink on ${bg}`).toBeGreaterThanOrEqual(7);
        expect.soft(c('--kk-ink-muted', bg), `${name} muted on ${bg}`).toBeGreaterThanOrEqual(4.5);
        expect.soft(c('--kk-rule-strong', bg), `${name} control edge on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test('accent text reaches 4.5:1 whichever accent an app picks, sign yellow included', () => {
    for (const [name, t] of themes()) {
      for (const a of ACCENTS) {
        const withAccent = new Map([...t, ['--kk-accent', `var(--kk-${a})`]]);
        const text = resolve(withAccent, 'var(--kk-accent-text)');
        for (const bg of ['--kk-ground', '--kk-surface']) {
          expect.soft(contrast(text, resolve(t, `var(${bg})`)), `${name} ${a} text on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  test('each on-accent colour reaches 4.5:1 on its accent', () => {
    const t = light();
    for (const a of ACCENTS) {
      expect.soft(contrast(resolve(t, `var(--kk-on-${a})`), resolve(t, `var(--kk-${a})`)), a).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('sign yellow is never a text colour on the ground', () => {
    const css = read('tokens.css') + read('base.css');
    expect(css).not.toMatch(/(?<![-\w])color:\s*var\(--kk-(sign-yellow|kuukou|accent)\)/);
  });
});

// ---- base.css ---------------------------------------------------------------------------------

describe('base.css', () => {
  const rules = (): {selector: string; body: string}[] =>
    [...read('base.css').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selector: m[1]!.trim(),
      body: m[2]!,
    }));

  test('sets Mincho only on names marked .kk-jp, so a lang="ja" page keeps B612 body text', () => {
    const mincho = rules().filter((r) => r.body.includes('--kk-font-jp'));
    expect(mincho.map((r) => r.selector)).toEqual([':where(.kk-jp)']);
    expect(read('base.css')).not.toMatch(/:lang\(|\[lang/);
  });

  test('colours placeholders in muted ink (held at 4.5:1 by the contrast test), in either theme', () => {
    const placeholder = rules().find((r) => r.selector === ':where(input, textarea)::placeholder');
    expect(placeholder?.body).toMatch(/color:\s*var\(--kk-ink-muted\)/);
    expect(placeholder?.body).toMatch(/opacity:\s*1/);
  });

  test('tints the selection with the accent', () => {
    expect(rules().find((r) => r.selector === '::selection')?.body).toMatch(/var\(--kk-accent\)/);
  });

  test('sets form fields at the body weight, after the rule that makes them inherit the font', () => {
    const all = rules();
    const inherit = all.findIndex((r) => /font:\s*inherit/.test(r.body));
    const weight = all.findIndex((r) => /font-weight:\s*400/.test(r.body)
      && ['input', 'select', 'textarea'].every((tag) => new RegExp(`\\b${tag}\\b`).test(r.selector)));
    expect(inherit).toBeGreaterThanOrEqual(0);
    expect(weight, 'a rule giving input, select and textarea font-weight: 400').toBeGreaterThan(inherit);
    // Buttons keep their bold.
    expect(all[weight]!.selector).not.toMatch(/\bbutton\b/);
  });
});

// ---- other origins ---------------------------------------------------------------------------

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('no other origin', () => {
  // Licence texts carry the licence's own address by design; they are not loaded by a page.
  const code = (): string[] => filesUnder(here).filter((f) => /\.(css|js|mjs|ts)$/.test(f) && !f.endsWith('_test.ts'));

  test('the kit has CSS to check', () => {
    expect(code().map((f) => relative(here, f)).sort()).toEqual(['base.css', 'fonts.css', 'tokens.css']);
  });

  test('no CSS or script under src/style names another origin', () => {
    for (const file of code()) {
      const text = readFileSync(file, 'utf8');
      expect.soft(text, relative(here, file)).not.toMatch(/https?:/i);
      expect.soft(text, relative(here, file)).not.toMatch(/url\(\s*['"]?\/\//);
      expect.soft(text, relative(here, file)).not.toMatch(/@import\s+(url\()?\s*['"]?\/\//);
    }
  });
});

// ---- fonts -----------------------------------------------------------------------------------

describe('fonts.css', () => {
  const faces = (): Map<string, string>[] =>
    [...read('fonts.css').matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
      const props = new Map<string, string>();
      for (const d of m[1]!.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) props.set(d[1]!, d[2]!.trim());
      return props;
    });

  test('every url() points at a file that exists', () => {
    const urls = [...read('fonts.css').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThanOrEqual(5);
    for (const u of urls) {
      expect(u, u).toMatch(/^\.\/fonts\//);
      expect.soft(existsSync(join(here, u)), u).toBe(true);
    }
  });

  test('declares the B612 faces in 400 and 700, and the Mincho subset', () => {
    const got = faces().map((f) => `${f.get('font-family')} ${f.get('font-weight')}`).sort();
    expect(got).toEqual([
      "'KK B612 Mono' 400",
      "'KK B612 Mono' 700",
      "'KK B612' 400",
      "'KK B612' 700",
      "'KK Macrons' 400",
      "'KK Macrons' 700",
      "'KK Mincho' 400 700",
    ]);
    for (const f of faces()) expect(f.get('font-display')).toBe('swap');
  });

  test("limits KK Mincho's unicode-range to the family kanji", () => {
    const mincho = faces().find((f) => f.get('font-family') === "'KK Mincho'")!;
    const range = mincho.get('unicode-range')!.split(/\s*,\s*/).map((u) => parseInt(u.replace(/^U\+/, ''), 16));
    expect(range).toEqual(FAMILY_KANJI.map((k) => k.codePointAt(0)!).sort((a, b) => a - b));
  });

  test('ships the OFL text beside each font family', () => {
    for (const name of ['B612-OFL.txt', 'B612-Mono-OFL.txt', 'NotoSerifJP-OFL.txt']) {
      expect(read(join('fonts', name))).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/i);
    }
  });
});

// ---- the subset font -------------------------------------------------------------------------

const UNKNOWN_TAG_INDEX = 63;

function readBase128(buf: Buffer, at: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[at + i]!;
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return [value, at + i + 1];
  }
  throw new Error('bad UIntBase128');
}

/** The `cmap` table of a WOFF2 file (index 0 of the known tags; WOFF2 never transforms it). */
function woff2Cmap(file: Buffer): Buffer {
  if (file.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not WOFF2');
  const numTables = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  let at = 48;
  let offset = 0;
  let cmap: [number, number] | undefined;
  for (let i = 0; i < numTables; i++) {
    const flags = file[at++]!;
    const tagIndex = flags & 0x3f;
    if (tagIndex === UNKNOWN_TAG_INDEX) at += 4;
    let length: number;
    [length, at] = readBase128(file, at);
    const version = flags >> 6;
    const transformed = tagIndex === 10 || tagIndex === 11 ? version !== 3 : version !== 0;
    if (transformed) [length, at] = readBase128(file, at);
    if (tagIndex === 0) cmap = [offset, length];
    offset += length;
  }
  if (!cmap) throw new Error('no cmap');
  const tables = brotliDecompressSync(file.subarray(at, at + compressedSize));
  return tables.subarray(cmap[0], cmap[0] + cmap[1]);
}

/** Code points mapped to a real glyph by the Unicode subtable of a cmap (format 4 or 12). */
function codePoints(cmap: Buffer): number[] {
  const out = new Set<number>();
  const n = cmap.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const platform = cmap.readUInt16BE(4 + i * 8);
    const sub = cmap.readUInt32BE(8 + i * 8);
    if (platform !== 0 && platform !== 3) continue;
    const format = cmap.readUInt16BE(sub);
    if (format === 12) {
      const groups = cmap.readUInt32BE(sub + 12);
      for (let g = 0; g < groups; g++) {
        const [start, end, glyph] = [0, 4, 8].map((o) => cmap.readUInt32BE(sub + 16 + g * 12 + o)) as [number, number, number];
        for (let c = start; c <= end; c++) if (glyph + c - start !== 0) out.add(c);
      }
    } else if (format === 4) {
      const segs = cmap.readUInt16BE(sub + 6) / 2;
      const ends = sub + 14;
      const starts = ends + segs * 2 + 2;
      const deltas = starts + segs * 2;
      const ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        const end = cmap.readUInt16BE(ends + s * 2);
        const start = cmap.readUInt16BE(starts + s * 2);
        const delta = cmap.readInt16BE(deltas + s * 2);
        const rangeOffset = cmap.readUInt16BE(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph: number;
          if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
          else {
            glyph = cmap.readUInt16BE(ranges + s * 2 + rangeOffset + (c - start) * 2);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) out.add(c);
        }
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

describe('the Mincho subset', () => {
  test('holds exactly the kanji of the family names', () => {
    const font = readFileSync(join(here, 'fonts', 'kk-mincho-subset.woff2'));
    const want = FAMILY_KANJI.map((k) => k.codePointAt(0)!).sort((a, b) => a - b);
    expect(codePoints(woff2Cmap(font)).map((c) => String.fromCodePoint(c)).join('')).toBe(
      want.map((c) => String.fromCodePoint(c)).join(''),
    );
  });

  test('is small', () => {
    expect(statSync(join(here, 'fonts', 'kk-mincho-subset.woff2')).size).toBeLessThan(20_000);
  });

  test('uses the kanji list the script builds from', () => {
    const script = readFileSync(join(here, '..', '..', 'scripts', 'subset-jp.mjs'), 'utf8');
    expect(script).toContain("'拠点空港航路図管制格納庫共有'");
  });
});

// ---- package exports -------------------------------------------------------------------------

describe('package.json', () => {
  test('exports the kit as subpaths of dist/style', () => {
    const pkg = JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8')) as {exports: Record<string, unknown>};
    expect(pkg.exports['./style/tokens.css']).toBe('./dist/style/tokens.css');
    expect(pkg.exports['./style/fonts.css']).toBe('./dist/style/fonts.css');
    expect(pkg.exports['./style/base.css']).toBe('./dist/style/base.css');
    expect(pkg.exports['./style/fonts/*']).toBe('./dist/style/fonts/*');
  });
});
