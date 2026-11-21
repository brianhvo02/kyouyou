# Changelog

All notable changes to kyouyou (共有) are recorded here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/) (0.y.z until 1.0).

## [Unreleased]

## [0.19.0] - 2026-11-20

### Added

- `project` and `family-bar`: Kōhō (航法) joins the family as `koho`, a `ProjectId` and a family-bar member between Kansei and Kakunouko (public address `https://koho.pages.dev/`, home path `../koho/`), with the accent tokens `--kk-koho` and `--kk-on-koho` (a provisional slate until Kōhō's page design) and `data-kk-accent="koho"`. Hosts upgrading should add `koho` to the family bar's `unavailable` until Kōhō is live, or the bar links an address with nothing behind it yet. The KK Mincho subset now carries 法.
- `arinc424/records`: ARINC 424-18 record kinds: `recordKindName` names every common section and subsection, `recordLayout` gives the identity, sequence and continuation columns for twenty kinds (procedure legs, airspace, FIR/UIR, runways, airports, communications, MSAs, path points, airway restrictions, navaids, markers and GLS reference paths; one primary record per identity and sequence, except the communications kinds, marked `grouped`, whose records form a set), and `subsectionColumn` and `subsectionOf` find the subsection code (terminal NDBs included). Types: `RecordLayout`, `ColumnSpan`, `IdentityField`.
- `arinc424/codes`: ARINC 424-18 codes in plain words: `describeAltitude`, `pathTerminatorName`, `routeTypeName`, `turnDirectionName` and `speedLimitDescription`.

## [0.18.0] - 2026-11-20

### Added

- `kansei-routes`: Kansei's helper lookups (airports, controllers, procedures, minimum sector altitudes) and plan saving as a transport-only Node request handler, built from data (`createKanseiRoutesFromData`) or from an X-Plane folder (`createKanseiRoutes`, which indexes in the background and answers 503 meanwhile). Also exports the file finders (`findAptFiles`, `findDataFile`, `findAtcFile`, `hasCifp`, `readCifpFrom`), `indexAptFiles`, `indexFixes`, `parseAtc` and the types (`Controller` among them), so a host, with or without an X-Plane folder, needs one import.

## [0.17.0] - 2026-11-20

### Added

- `wx/upstream`: `relayHazards` (with `hazardsUpstream` and `HAZARDS_PATH`), the weather-hazards relay: `?kind=sigmet|isigmet|gairmet` answers with NOAA's GeoJSON FeatureCollection, forwarding only the kind; callers cache it for 300 s.

## [0.16.0] - 2026-11-20

### Added

- `style/tokens.css`, `style/fonts.css`, `style/base.css`: the family style kit: `--kk-` tokens (palette, five accents, type, spacing, radii, focus ring, bar height) in light and dark, self-hosted B612, B612 Mono and a Noto Serif JP subset of the family's kanji, `data-kk-accent` for parts of a page in another member's accent, and opt-in base rules.
- `family-bar`: `<kk-family-bar>`, the family's row of taxiway signs (the location sign for the current surface, direction signs to the others), with public and home link modes, unavailable members, and a compact or phone-width menu; registered by `defineFamilyBar()`.

## [0.15.0] - 2026-11-20

### Added

- `xplane/aptdat`: `readAptDat` streams X-Plane's global airport file and yields each airport's name, elevation, metadata, land runways and frequencies.
- `kuukou/fake-server` serves the `xplane-airports` folder (`apt.dat` only) and reports it in the server check.

## [0.14.0] - 2026-11-19

### Added

- `project`: builds an app's `project.json` (version, changes, roadmap, features) from its `CHANGELOG.md`, `ROADMAP.md` and README `## Features`, with `buildProjectJson`, the three parsers and a Vite plugin that also defines `__PROJECT_VERSION__` (the package.json version) for the app.

## [0.13.1] - 2026-11-19

### Fixed

- `xplane/cifp`, `faa/cifp`: approach names in the dash form (such as `R18-Z`) give their runway and variant.
- `xplane/nav`: the airport column is documented.

## [0.13.0] - 2026-11-19

### Added

- `faa/airspace`: `parseRestrictiveAirspace` reads restricted, prohibited and other special-use areas from ARINC 424-18 records, in the same shape as `xplane/airspace`.

## [0.12.0] - 2026-11-19

### Added

- `xplane/cifp`, `faa/cifp`: leg geometry for curved and navaid-referenced legs: turn direction, recommended navaid with theta and rho, RF arc centre and radius, route distance or hold time, vertical angle.

### Fixed

- `xplane/cifp`: the centre fix column is read as an arc centre only on RF legs.

## [0.11.0] - 2026-11-19

### Added

- `geo/magnetic`: `declination` gives the magnetic variation from the World Magnetic Model 2025.
- `wx/upstream`: `relayWx`, the airport-weather relay's upstream, forwarding only the ident.
- `kuukou/fake-server`: a stand-in Kuukou server for apps' tests, with folder manifests and files with Range.

## [0.10.0] - 2026-11-19

### Added

- `xplane/fix`, `xplane/nav`: readers for X-Plane's fix and navaid files.
- `xplane/awy`: `parseAwySegments` and `airwayRuns`, which stitches segments into airways.
- `xplane/hold`, `xplane/msa`, `xplane/mora`: readers for holds, minimum sector altitudes and the grid MORA, with `moraAt`.
- `fms`: `writeFms` takes an optional altitude per leg.

## [0.9.0] - 2026-11-19

### Added

- `xplane/airspace`: `parseAirspaces` and `airspacesAt` for X-Plane's airspace file.
- `xplane/atc`: `parseAtc` and `controllersAt` for X-Plane's ATC file.

## [0.8.0] - 2026-11-19

### Added

- `xplane/aptmeta`: `parseAptMeta` reads each airport's own transition altitude and level, elevation, use and longest runway.
- `xplane/cifp`, `faa/cifp`: glide slope and glide slope intercept altitudes on legs.

### Changed

- `xplane/cifp`, `faa/cifp`: courses written in whole degrees true are read instead of dropped; legs gain `courseTrue`.

## [0.7.0] - 2026-11-19

### Fixed

- `xplane/cifp`, `faa/cifp`: below-sea-level leg altitudes are kept instead of dropped.
- `faa/cifp`: the transition altitude comes from the airport record, so airports with runways but no procedures get one too.

## [0.6.1] - 2026-11-19

The first entry, summarising everything up to this version.

### Added

- `gfs/fields`, `gfs/grib2`, `gfs/noaa-index`, `gfs/fake-gfs`: winds aloft from NOAA GFS and a stand-in server for tests.
- `atmosphere`, `geo`, `geo/track`, `geo/polygon`: ISA atmosphere and great-circle, track and polygon helpers.
- `fms`: `parseFms` and `writeFms` for X-Plane's `.fms` flight plan, including the approach.
- `xplane/read`: reading X-Plane 12's web API with reconnects.
- `xplane/cifp`, `faa/cifp`: procedure readers for X-Plane's and the FAA's files, in one shape.

### Fixed

- `fms`: `writeFms` writes the destination runway for an approach without a STAR block.
