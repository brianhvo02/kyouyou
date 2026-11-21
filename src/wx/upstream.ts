// From Kōkūzu's scripts/wx-upstream.ts, moved into kyouyou with its agreement (2026-11-19) so Kōkūzu's Pages
// Function, its dev servers and the Kuukou server share one copy.
//
// The airport-weather relay, shared by everything that serves the app: the Cloudflare Pages Function
// (functions/wx.ts) on the deployed site, the Vite dev server and the LAN host. NOAA's Aviation Weather
// Center does not allow cross-site requests from a browser, so the page asks its own origin for
// /wx?id=KSFO and that origin asks NOAA.

/** The path the app asks its own origin for. */
export const WX_PATH = '/wx';

const UPSTREAM = 'https://aviationweather.gov/api/data/metar';

/** NOAA's URL for one airport's latest METAR (with its TAF), or an error for anything that isn't an ICAO ident. */
export function wxUpstream(search: string): {url: string} | {error: string} {
  const id = new URLSearchParams(search).get('id')?.trim().toUpperCase() ?? '';
  // Only ever an ident: nothing else from the request reaches NOAA.
  if (!/^[A-Z0-9]{3,4}$/.test(id)) return {error: 'id must be a 3- or 4-character airport ident'};
  return {url: `${UPSTREAM}?ids=${id}&format=json&taf=true`};
}

/** Asks NOAA and answers as the relay does: its JSON passed through, or a short JSON error. */
export async function relayWx(search: string, doFetch: typeof fetch = fetch): Promise<{status: number; body: string}> {
  const up = wxUpstream(search);
  if ('error' in up) return {status: 400, body: JSON.stringify({error: up.error})};
  try {
    const res = await doFetch(up.url, {headers: {accept: 'application/json'}});
    // No report for the ident comes back as 204 with no body: an empty list says the same to the page.
    if (res.status === 204) return {status: 200, body: '[]'};
    if (!res.ok) return {status: 502, body: JSON.stringify({error: `weather source answered ${res.status}`})};
    return {status: 200, body: await res.text()};
  } catch {
    return {status: 502, body: JSON.stringify({error: 'weather source not reachable'})};
  }
}

/** The path the app asks its own origin for weather hazards: /wx/hazards?kind=sigmet. Callers send `Cache-Control: public, max-age=300`. */
export const HAZARDS_PATH = '/wx/hazards';

const HAZARDS_UPSTREAM: Readonly<Record<string, string>> = {
  sigmet: 'https://aviationweather.gov/api/data/airsigmet?format=geojson',
  isigmet: 'https://aviationweather.gov/api/data/isigmet?format=geojson',
  gairmet: 'https://aviationweather.gov/api/data/gairmet?format=geojson',
};

const HAZARDS_TIMEOUT_MS = 10_000;

/** NOAA's GeoJSON URL for one kind of hazard (sigmet, isigmet or gairmet), or an error for any other request. */
export function hazardsUpstream(search: string): {url: string} | {error: string} {
  const params = new URLSearchParams(search);
  const kinds = params.getAll('kind');
  // Exactly one `kind` and nothing else: only the choice of kind reaches NOAA.
  if (kinds.length !== 1 || [...params.keys()].length !== 1) return {error: 'ask with exactly one kind: sigmet, isigmet or gairmet'};
  const url = Object.hasOwn(HAZARDS_UPSTREAM, kinds[0]) ? HAZARDS_UPSTREAM[kinds[0]] : undefined;
  if (!url) return {error: 'kind must be sigmet, isigmet or gairmet'};
  return {url};
}

/**
 * Asks NOAA for a hazard collection and answers as the relay does: its GeoJSON FeatureCollection passed through
 * unchanged, or a short JSON error. Callers set `Cache-Control: public, max-age=300` on a 200.
 */
export async function relayHazards(search: string, doFetch: typeof fetch = fetch): Promise<{status: number; body: string}> {
  const up = hazardsUpstream(search);
  if ('error' in up) return {status: 400, body: JSON.stringify({error: up.error})};
  try {
    const res = await doFetch(up.url, {headers: {accept: 'application/json'}, signal: AbortSignal.timeout(HAZARDS_TIMEOUT_MS)});
    if (!res.ok) return {status: 502, body: JSON.stringify({error: `weather source answered ${res.status}`})};
    const body = await res.text();
    let type: unknown;
    try {
      type = (JSON.parse(body) as {type?: unknown} | null)?.type;
    } catch {
      type = undefined;
    }
    if (type !== 'FeatureCollection') return {status: 502, body: JSON.stringify({error: 'weather source answered something other than GeoJSON'})};
    return {status: 200, body};
  } catch {
    return {status: 502, body: JSON.stringify({error: 'weather source not reachable'})};
  }
}
