# kyoyu (共有)

Code shared by the flight-simulation apps Kōkūzu (charts), Kōro (planning) and Kansei (ATC).
The name is a working one.

It ships plain TypeScript source with `.ts` import extensions and no build step. Everything is
erasable syntax, so Node 24 can run it directly, and Vite builds it like the app's own code.

## What is in it

| Import | What it is |
|---|---|
| `kyoyu/gfs/fields.ts` | Winds aloft from NOAA GFS: picks the run, fetches byte ranges, decodes and caches fields |
| `kyoyu/gfs/grib2.ts` | The GRIB2 decoder those fields are read with |
| `kyoyu/gfs/noaa-index.ts` | Reads a GFS `.idx` file to find a field's byte range |
| `kyoyu/gfs/fake-gfs.ts` | A stand-in GFS server for an app's own tests (needs vitest) |
| `kyoyu/atmosphere.ts` | ISA atmosphere: pressure and temperature at altitude, flight level to GFS pressure level, Mach and CAS to TAS |

No app data lives here: no Jeppesen, Navigraph or X-Plane files, and nothing converted from one.

## Using it

Pin it as a git dependency at a tag or commit. Under vitest, tell it to transform the package,
because Node will not strip types from files under `node_modules`:

```ts
// vitest.config.ts
export default defineConfig({test: {server: {deps: {inline: ['kyoyu']}}}});
```

## Working on it

`npm test` and `npm run typecheck`. A change here reaches an app only when that app moves its pin.
