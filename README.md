# kyouyou (共有)

Code shared by the flight-simulation apps Kōkūzu (charts), Kōro (planning) and Kansei (ATC).
The name is a working one.

The source is plain erasable TypeScript with `.ts` import extensions. The built JavaScript and type
declarations in `dist/` are committed, and that is what an app imports: nothing is built on install,
so it works from a plain Node script, under vitest and in a Vite build alike.

## Features

- **Reads X-Plane's navigation files.** `xplane/cifp`, `xplane/aptmeta`, `xplane/airspace`, `xplane/atc`, `xplane/fix`, `xplane/nav`, `xplane/awy`, `xplane/hold`, `xplane/msa` and `xplane/mora` parse the files from a user's own X-Plane folder into plain objects.
- **Reads the FAA's procedure and airspace data.** `faa/cifp` and `faa/airspace` give SIDs, STARs, approaches, runways and restrictive airspace in the same shape as the X-Plane readers.
- **Reads and writes X-Plane flight plans.** `fms` parses and writes the v1100 `.fms` format, approach included.
- **Geometry and magnetic variation.** `geo`, `geo/track`, `geo/polygon` and `geo/magnetic` cover distance, bearing, tracks, polygon tests and the World Magnetic Model.
- **Weather and winds aloft.** `gfs/*` decodes NOAA GFS winds, `atmosphere` converts altitude and speed, and `wx/upstream` relays airport weather and weather hazards.
- **A Kuukou server stand-in.** `kuukou/fake-server` and `gfs/fake-gfs` let an app test against made-up servers.
- **Reads X-Plane live.** `xplane/read` subscribes to datarefs over the web API and reconnects by itself.
- **The family style kit.** `style/tokens.css`, `style/fonts.css` and `style/base.css` give every Kyoten Kuukou surface the same airside-sign palette, B612 type and Mincho names, light and dark, with the fonts self-hosted.
- **The family bar.** `family-bar` is a row of airfield taxiway signs along the top of every surface: where you are, and the way to the other apps.
- **Builds `project.json`.** `project` turns a changelog, roadmap and features list into the file the hub dashboard reads.

## What is in it

| Import | What it is |
|---|---|
| `kyouyou/gfs/fields` | Winds aloft from NOAA GFS: picks the run, fetches byte ranges, decodes and caches fields |
| `kyouyou/gfs/grib2` | The GRIB2 decoder those fields are read with |
| `kyouyou/gfs/noaa-index` | Reads a GFS `.idx` file to find a field's byte range |
| `kyouyou/gfs/fake-gfs` | A stand-in GFS server for an app's own tests (needs vitest) |
| `kyouyou/atmosphere` | ISA atmosphere: pressure and temperature at altitude, flight level to GFS pressure level, Mach and CAS to TAS |
| `kyouyou/geo` | Great-circle distance, initial bearing, nearest of a list, a point part-way along |
| `kyouyou/geo/track` | A point at a bearing and distance; distance across and along a course |
| `kyouyou/geo/polygon` | Whether a position is inside a latitude/longitude ring, across the antimeridian too |
| `kyouyou/geo/magnetic` | True to magnetic and back, given the variation; `declination` gives the magnetic variation from NOAA's World Magnetic Model 2025 |
| `kyouyou/fms` | X-Plane's v1100 `.fms` flight plan: `parseFms` and `writeFms`, held together by a round-trip test |
| `kyouyou/xplane/read` | X-Plane 12 web API, reading only: subscribes to the datarefs you name, reconnects by itself, reports `off`, `connecting`, `connected`, `unavailable` or `no-flight`, times out requests, `read` fetches values once, and `decodeText` decodes text datarefs |
| `kyouyou/xplane/cifp` | X-Plane per-airport procedure files (`CIFP/ICAO.dat`): `parseCifp` reads SIDs, STARs and approaches with path terminators, altitude and speed limits (with glide slope and intercept altitudes), magnetic or true courses, fix roles and the missed approach, leg geometry (turn direction, recommended navaid with theta and rho, RF arc centre and radius, route distance or hold time, vertical angle), plus runway thresholds and the transition altitude, in a model-neutral shape |
| `kyouyou/xplane/aptmeta` | X-Plane's airport metadata file (`earth_aptmeta.dat`): `parseAptMeta` reads each airport's own transition altitude and level, elevation, use (civil, military, private, joint) and longest runway |
| `kyouyou/xplane/airspace` | X-Plane's airspace file (`airspaces/airspace.txt`): `parseAirspaces` reads each area's class, name, floor, ceiling and boundary; `airspacesAt` finds the areas around a point |
| `kyouyou/xplane/aptdat` | X-Plane's global airport file (`Global Scenery/Global Airports/Earth nav data/apt.dat`): `readAptDat` streams it (chunks split anywhere) and yields each airport with kind, ident, name, elevation, `1302` metadata, land runways with both ends and displaced thresholds, and frequencies in both row schemes |
| `kyouyou/xplane/atc` | X-Plane's ATC file (`1200 atc data/Earth nav data/atc.dat`): `parseAtc` reads each controller's name, role, frequencies in kHz, sectors, and for towers the airport, transition altitude and class; `controllersAt` finds who controls a point (based on Kansei's reader) |
| `kyouyou/xplane/fix` | X-Plane's fix file (`earth_fix.dat`, FIX1101/1200): `parseFix` reads each fix's ident, region, airport, position, type and name (based on Kouro's reader) |
| `kyouyou/xplane/nav` | X-Plane's navaid file (`earth_nav.dat`, NAV1150/1200): `parseNav` reads every row type (NDB, VOR, ILS localizer and glideslope, markers, DME, SBAS/GBAS path points) with its fields as written (based on Kouro's reader) |
| `kyouyou/xplane/awy` | X-Plane's airway file (`earth_awy.dat`, AWY1100/1101): `parseAwySegments` reads each segment; `airwayRuns` stitches them into airways (Kouro's stitching) |
| `kyouyou/xplane/hold` | X-Plane's hold file (`earth_hold.dat`, HOLD1140): `parseHolds` reads each published hold |
| `kyouyou/xplane/msa` | X-Plane's MSA file (`earth_msa.dat`, MSA1150): `parseMsa` reads each point's minimum sector altitudes |
| `kyouyou/xplane/mora` | X-Plane's grid MORA file (`earth_mora.dat`, MORA1150): `parseMora` reads the 1°×1° grid; `moraAt` looks a position up |
| `kyouyou/wx/upstream` | The airport-weather relay's upstream (NOAA's Aviation Weather Center): `relayWx` answers `?id=ICAO` with NOAA's METAR/TAF JSON, forwarding only the ident (from Kōkūzu); `relayHazards` answers `?kind=sigmet\|isigmet\|gairmet` with NOAA's GeoJSON hazards, forwarding only the kind (callers send `Cache-Control: public, max-age=300`) |
| `kyouyou/kuukou/fake-server` | A stand-in Kuukou server for apps' tests (needs Node): server check, folder manifests, files with Range, from made-up files |
| `kyouyou/faa/cifp` | The FAA's CIFP file (`FAACIFP18`, ARINC 424-18): `parseFaaCifp` reads every airport's SIDs, STARs, approaches and runways into the same shape as `kyouyou/xplane/cifp`, from lines a caller may stream |
| `kyouyou/faa/airspace` | Restrictive airspace in ARINC 424-18 (`UR` records, as in the FAA's `FAACIFP18`): `parseRestrictiveAirspace` reads restricted, prohibited and other special-use areas, with arcs and circles turned into points no more than 1 NM apart, into the same shape as `kyouyou/xplane/airspace` (so `airspacesAt` works on both), plus designation, region, multiple code, time code, NOTAM flag and the limits as written |
| `kyouyou/project` | The hub dashboard's `project.json` (schema 1): `buildProjectJson` turns an app's `CHANGELOG.md`, `ROADMAP.md` and README `## Features` list into one object (version, release date, every changelog entry, unreleased changes, roadmap, features), and refuses text that holds a local path (`/Users/`, `/home/`, `~/`, `C:\`, not inside a URL) or a `login@machine`; `projectJsonPlugin` also defines `__PROJECT_VERSION__` (the package.json version) for the app, declared with `declare const __PROJECT_VERSION__: string`; `parseChangelog`, `parseRoadmap` and `parseFeatures` read the sources alone. No dependencies |
| `kyouyou/style/tokens.css` | The family's design tokens as `--kk-` custom properties: chart paper, chart ink, rules, sign yellow and black; the five accents (`--kk-kuukou`, `--kk-kouro`, `--kk-kokuzu`, `--kk-kansei`, `--kk-kakunouko`) with `--kk-on-<app>` for text on each; `--kk-accent`, `--kk-accent-text` (contrast-safe text in the accent's hue) and `--kk-on-accent`; `--kk-font-text`, `--kk-font-figures`, `--kk-font-jp`; the type scale `--kk-step--2` to `--kk-step-4`; spacing, radii, the focus ring (`--kk-focus-outline`, `--kk-focus-offset`, `--kk-focus-shadow`, from `--kk-focus-inner`, `--kk-focus-outer` and `--kk-focus-width`) and `--kk-bar-height`; `data-kk-accent="<member>"` puts part of a page in another accent. Dark under `prefers-color-scheme` unless the root has `data-theme="light"`, and whenever it has `data-theme="dark"`; reads no storage |
| `kyouyou/style/fonts.css` | `@font-face` rules for `KK B612` and `KK B612 Mono` (400, 700) and `KK Mincho` (Noto Serif JP cut to the family's kanji), loaded by relative URL from `style/fonts/` so the app's bundler copies them; OFL texts beside the files |
| `kyouyou/style/base.css` | Opt-in base rules at zero specificity: body type, headings, Japanese names (`.kk-jp`, with `lang="ja"` on the element), figures, links, buttons (`.kk-button`, `.kk-button-primary`), inputs, the focus ring, reduced motion |
| `kyouyou/style/fonts/*` | The font files and their licences |
| `kyouyou/family-bar` | `<kk-family-bar current mode unavailable compact>`, a framework-free custom element registered by `defineFamilyBar()` (once; calling it again does nothing; does nothing outside a browser). The current member (`kuukou`, `kouro`, `kokuzu`, `kansei`, `kakunouko`) is the location sign, not a link, with `aria-current="page"`; the others are direction signs. `mode="public"` (default) links each public address and hides Kakunouko unless it is current; `mode="home"` links `../<app>/`, Kakunouko `../` and Kuukou the public dashboard. `unavailable="kansei kokuzu"` hides members (never the current one). `compact`, and every bar under 600 px of viewport, shows only the location sign, a button that opens the others (Enter, click or tap; Escape or a tap outside closes and focus returns). Its CSS is inside the module, applied in its shadow root (a constructed stylesheet, or a `<style>` where there is none), so it needs no loader and loads nothing from any origin; it takes the `--kk-` tokens through the shadow boundary, so it follows the root `data-theme` and the OS setting. `FAMILY` lists the members, names, kanji and links; `FamilyBarElement` types the element (declared on `HTMLElementTagNameMap`) |

No app data lives here: no Jeppesen, Navigraph or X-Plane files, and nothing converted from one.

## Using it

Pin it as a git dependency at a tag or commit, and import by the paths above.

### The style kit

Import the CSS from a bundled entry (Vite, or esbuild with a `file` loader for `.woff2`); the font
URLs are relative, so a bundler that cannot load them fails the build rather than falling back:

```css
@import 'kyouyou/style/fonts.css';
@import 'kyouyou/style/tokens.css';
@import 'kyouyou/style/base.css'; /* optional */

:root { --kk-accent: var(--kk-kouro); }
```

Set `--kk-accent` on `:root` (where `--kk-accent-text` is worked out). Every rule in `tokens.css` sits
in `:where()` and weighs nothing, so an app's own `:root { --kk-ground: … }` wins in light and dark
alike. An app that fills a control
with its accent also sets `--kk-on-accent: var(--kk-on-kouro)`. Sign yellow is for signs and the
focus ring, never for text on the ground; use `--kk-accent-text` for text.

A part of a page in another member's accent (the dashboard's cards, a preview) marks itself with
`data-kk-accent`:

```html
<article data-kk-accent="kokuzu">…</article>
```

`data-kk-accent="<member>"` sets `--kk-accent` and `--kk-on-accent` to that member's, and on any
element that carries the attribute `--kk-accent-text` is worked out again from its own accent (a bare
`data-kk-accent` does only that, for an accent set in the element's own CSS). Without the attribute a
nested `--kk-accent` would still show the root's accent text, because a custom property is worked out
where it is declared. The rules have zero specificity, so an app's own rules win. Keep setting the
app's own accent on `:root` as above.

### The family bar

```ts
import {defineFamilyBar} from 'kyouyou/family-bar';
defineFamilyBar();
```

```html
<kk-family-bar current="kouro" mode="public"></kk-family-bar>
```

Load the style kit's `fonts.css` and `tokens.css` on the page too: faces cannot be declared inside a
shadow root, and the tokens give the strip its themed ground and rule (without them it falls back to
the light values). In home mode, pass the members `/api/server` reports unavailable; the bar never
probes. The module declares the tag for TypeScript (`document.createElement('kk-family-bar')` is a
`FamilyBarElement`). React renders it as a plain custom element (declare `kk-family-bar` in the app's
JSX intrinsic elements); set `compact` where an app's own toolbar hosts it.

A compact bar, and every bar under 600 px, opens its menu as an absolutely positioned panel just
below the location sign, inside the bar. So the host must let it out:

- No `overflow: hidden`, `auto` or `scroll`, and no `contain: paint`, on the toolbar or any ancestor
  between it and the page, or the menu is clipped (the open menu is about 12 rem tall).
- The open bar raises itself to `z-index: 1000`, but only within its own stacking context. If the
  toolbar makes one (a `transform`, `filter`, `opacity` below 1, or `position` with a `z-index`),
  give the toolbar itself a `z-index` above the content the menu must cover.

## Working on it

Edit `src/`, then `npm run check`: it type-checks, runs the tests, rebuilds `dist/` and fails if the
committed `dist/` was stale. Commit `src/` and `dist/` together. A change here reaches an app only
when that app moves its pin.

The build also copies `src/style/` (CSS, fonts, licences) to `dist/style/`. The Mincho subset is made
by `node scripts/subset-jp.mjs <NotoSerifJP[wght].ttf>` (the variable font from Google's font
repository) whenever the family's names change; commit the font it writes.
