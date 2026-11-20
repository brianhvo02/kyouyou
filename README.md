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
- **Weather and winds aloft.** `gfs/*` decodes NOAA GFS winds, `atmosphere` converts altitude and speed, and `wx/upstream` relays airport weather.
- **A Kuukou server stand-in.** `kuukou/fake-server` and `gfs/fake-gfs` let an app test against made-up servers.
- **Reads X-Plane live.** `xplane/read` subscribes to datarefs over the web API and reconnects by itself.
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
| `kyouyou/xplane/atc` | X-Plane's ATC file (`1200 atc data/Earth nav data/atc.dat`): `parseAtc` reads each controller's name, role, frequencies in kHz, sectors, and for towers the airport, transition altitude and class; `controllersAt` finds who controls a point (based on Kansei's reader) |
| `kyouyou/xplane/fix` | X-Plane's fix file (`earth_fix.dat`, FIX1101/1200): `parseFix` reads each fix's ident, region, airport, position, type and name (based on Kouro's reader) |
| `kyouyou/xplane/nav` | X-Plane's navaid file (`earth_nav.dat`, NAV1150/1200): `parseNav` reads every row type (NDB, VOR, ILS localizer and glideslope, markers, DME, SBAS/GBAS path points) with its fields as written (based on Kouro's reader) |
| `kyouyou/xplane/awy` | X-Plane's airway file (`earth_awy.dat`, AWY1100/1101): `parseAwySegments` reads each segment; `airwayRuns` stitches them into airways (Kouro's stitching) |
| `kyouyou/xplane/hold` | X-Plane's hold file (`earth_hold.dat`, HOLD1140): `parseHolds` reads each published hold |
| `kyouyou/xplane/msa` | X-Plane's MSA file (`earth_msa.dat`, MSA1150): `parseMsa` reads each point's minimum sector altitudes |
| `kyouyou/xplane/mora` | X-Plane's grid MORA file (`earth_mora.dat`, MORA1150): `parseMora` reads the 1°×1° grid; `moraAt` looks a position up |
| `kyouyou/wx/upstream` | The airport-weather relay's upstream (NOAA's Aviation Weather Center): `relayWx` answers `?id=ICAO` with NOAA's METAR/TAF JSON, forwarding only the ident (from Kōkūzu) |
| `kyouyou/kuukou/fake-server` | A stand-in Kuukou server for apps' tests (needs Node): server check, folder manifests, files with Range, from made-up files |
| `kyouyou/faa/cifp` | The FAA's CIFP file (`FAACIFP18`, ARINC 424-18): `parseFaaCifp` reads every airport's SIDs, STARs, approaches and runways into the same shape as `kyouyou/xplane/cifp`, from lines a caller may stream |
| `kyouyou/faa/airspace` | Restrictive airspace in ARINC 424-18 (`UR` records, as in the FAA's `FAACIFP18`): `parseRestrictiveAirspace` reads restricted, prohibited and other special-use areas, with arcs and circles turned into points no more than 1 NM apart, into the same shape as `kyouyou/xplane/airspace` (so `airspacesAt` works on both), plus designation, region, multiple code, time code, NOTAM flag and the limits as written |
| `kyouyou/project` | The hub dashboard's `project.json` (schema 1): `buildProjectJson` turns an app's `CHANGELOG.md`, `ROADMAP.md` and README `## Features` list into one object (version, release date, every changelog entry, unreleased changes, roadmap, features), and refuses text that holds a local path (`/Users/`, `/home/`, `~/`, `C:\`, not inside a URL) or a `login@machine`; `projectJsonPlugin` also defines `__PROJECT_VERSION__` (the package.json version) for the app, declared with `declare const __PROJECT_VERSION__: string`; `parseChangelog`, `parseRoadmap` and `parseFeatures` read the sources alone. No dependencies |

No app data lives here: no Jeppesen, Navigraph or X-Plane files, and nothing converted from one.

## Using it

Pin it as a git dependency at a tag or commit, and import by the paths above.

## Working on it

Edit `src/`, then `npm run check`: it type-checks, runs the tests, rebuilds `dist/` and fails if the
committed `dist/` was stale. Commit `src/` and `dist/` together. A change here reaches an app only
when that app moves its pin.
