# kyoyu (共有)

Code shared by the flight-simulation apps Kōkūzu (charts), Kōro (planning) and Kansei (ATC).
The name is a working one.

The source is plain erasable TypeScript with `.ts` import extensions. The built JavaScript and type
declarations in `dist/` are committed, and that is what an app imports: nothing is built on install,
so it works from a plain Node script, under vitest and in a Vite build alike.

## What is in it

| Import | What it is |
|---|---|
| `kyoyu/gfs/fields` | Winds aloft from NOAA GFS: picks the run, fetches byte ranges, decodes and caches fields |
| `kyoyu/gfs/grib2` | The GRIB2 decoder those fields are read with |
| `kyoyu/gfs/noaa-index` | Reads a GFS `.idx` file to find a field's byte range |
| `kyoyu/gfs/fake-gfs` | A stand-in GFS server for an app's own tests (needs vitest) |
| `kyoyu/atmosphere` | ISA atmosphere: pressure and temperature at altitude, flight level to GFS pressure level, Mach and CAS to TAS |
| `kyoyu/geo` | Great-circle distance, initial bearing, nearest of a list, a point part-way along |
| `kyoyu/geo/track` | A point at a bearing and distance; distance across and along a course |
| `kyoyu/geo/polygon` | Whether a position is inside a latitude/longitude ring, across the antimeridian too |
| `kyoyu/geo/magnetic` | True to magnetic and back, given the variation |
| `kyoyu/fms` | X-Plane's v1100 `.fms` flight plan: `parseFms` and `writeFms`, held together by a round-trip test |

No app data lives here: no Jeppesen, Navigraph or X-Plane files, and nothing converted from one.

## Using it

Pin it as a git dependency at a tag or commit, and import by the paths above.

## Working on it

Edit `src/`, then `npm run check`: it type-checks, runs the tests, rebuilds `dist/` and fails if the
committed `dist/` was stale. Commit `src/` and `dist/` together. A change here reaches an app only
when that app moves its pin.
