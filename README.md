# kyouyou (共有)

Code shared by the flight-simulation apps Kōkūzu (charts), Kōro (planning) and Kansei (ATC).
The name is a working one.

The source is plain erasable TypeScript with `.ts` import extensions. The built JavaScript and type
declarations in `dist/` are committed, and that is what an app imports: nothing is built on install,
so it works from a plain Node script, under vitest and in a Vite build alike.

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
| `kyouyou/geo/magnetic` | True to magnetic and back, given the variation |
| `kyouyou/fms` | X-Plane's v1100 `.fms` flight plan: `parseFms` and `writeFms`, held together by a round-trip test |
| `kyouyou/xplane/read` | X-Plane 12 web API, reading only: subscribes to the datarefs you name, reconnects by itself, reports `off`, `connecting`, `connected`, `unavailable` or `no-flight`, times out requests, `read` fetches values once, and `decodeText` decodes text datarefs |
| `kyouyou/xplane/cifp` | X-Plane per-airport procedure files (`CIFP/ICAO.dat`): `parseCifp` reads SIDs, STARs and approaches with path terminators, altitude and speed limits (with glide slope and intercept altitudes), magnetic or true courses, fix roles and the missed approach, plus runway thresholds and the transition altitude, in a model-neutral shape |
| `kyouyou/xplane/aptmeta` | X-Plane's airport metadata file (`earth_aptmeta.dat`): `parseAptMeta` reads each airport's own transition altitude and level, elevation, use (civil, military, private, joint) and longest runway |
| `kyouyou/xplane/airspace` | X-Plane's airspace file (`airspaces/airspace.txt`): `parseAirspaces` reads each area's class, name, floor, ceiling and boundary; `airspacesAt` finds the areas around a point |
| `kyouyou/faa/cifp` | The FAA's CIFP file (`FAACIFP18`, ARINC 424-18): `parseFaaCifp` reads every airport's SIDs, STARs, approaches and runways into the same shape as `kyouyou/xplane/cifp`, from lines a caller may stream |

No app data lives here: no Jeppesen, Navigraph or X-Plane files, and nothing converted from one.

## Using it

Pin it as a git dependency at a tag or commit, and import by the paths above.

## Working on it

Edit `src/`, then `npm run check`: it type-checks, runs the tests, rebuilds `dist/` and fails if the
committed `dist/` was stale. Commit `src/` and `dist/` together. A change here reaches an app only
when that app moves its pin.
