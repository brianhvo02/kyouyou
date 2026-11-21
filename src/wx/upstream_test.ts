import {describe, expect, test} from 'vitest';
import {hazardsUpstream, relayHazards, relayWx, wxUpstream} from './upstream.ts';

// Ported from Kōkūzu's scripts/wx-upstream_test.mjs.
describe('wxUpstream', () => {
  test("builds NOAA's URL from an ident, upper-cased", () => {
    expect(wxUpstream('?id=ksfo')).toEqual({url: 'https://aviationweather.gov/api/data/metar?ids=KSFO&format=json&taf=true'});
  });

  test('refuses anything that is not an ident, so nothing else reaches NOAA', () => {
    for (const s of ['', '?id=', '?id=KSFO,KLAX', '?id=KS FO', '?id=../x', '?id=TOOLONG', '?ids=KSFO']) expect('error' in wxUpstream(s), s).toBe(true);
  });
});

describe('relayWx', () => {
  test("passes NOAA's JSON through", async () => {
    const seen: string[] = [];
    const out = await relayWx('?id=KSFO', async (url) => {
      seen.push(String(url));
      return new Response('[{"icaoId":"KSFO"}]', {status: 200});
    });
    expect(out).toEqual({status: 200, body: '[{"icaoId":"KSFO"}]'});
    expect(seen).toHaveLength(1);
  });

  test('no report (204) reads as an empty list; a bad ident never fetches', async () => {
    expect(await relayWx('?id=ZZZZ', async () => new Response(null, {status: 204}))).toEqual({status: 200, body: '[]'});
    let called = false;
    const bad = await relayWx('?id=bad!', async () => { called = true; return new Response('[]'); });
    expect(bad.status).toBe(400);
    expect(called).toBe(false);
  });

  test('an upstream failure is a 502 with a short reason', async () => {
    expect((await relayWx('?id=KSFO', async () => new Response('x', {status: 500}))).status).toBe(502);
    expect((await relayWx('?id=KSFO', async () => { throw new Error('offline'); })).status).toBe(502);
  });
});

describe('hazardsUpstream', () => {
  test('maps each kind to its NOAA GeoJSON URL', () => {
    expect(hazardsUpstream('?kind=sigmet')).toEqual({url: 'https://aviationweather.gov/api/data/airsigmet?format=geojson'});
    expect(hazardsUpstream('kind=isigmet')).toEqual({url: 'https://aviationweather.gov/api/data/isigmet?format=geojson'});
    expect(hazardsUpstream('?kind=gairmet')).toEqual({url: 'https://aviationweather.gov/api/data/gairmet?format=geojson'});
  });

  test('refuses a missing, unknown or repeated kind and any extra parameter', () => {
    for (const s of ['', '?kind=', '?kind=metar', '?kind=SIGMET', '?kind=sigmet&kind=gairmet', '?kind=sigmet&hours=6', '?kind=sigmet&kind=sigmet', '?type=sigmet', '?kind=constructor', '?kind=__proto__']) {
      expect('error' in hazardsUpstream(s), s).toBe(true);
    }
  });
});

describe('relayHazards', () => {
  const collection = '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"hazard":"TS"},"geometry":null}]}\n';

  test('passes a good collection through byte for byte, asking only for the kind', async () => {
    const seen: string[] = [];
    const out = await relayHazards('?kind=gairmet', async (url) => {
      seen.push(String(url));
      return new Response(collection, {status: 200});
    });
    expect(out).toEqual({status: 200, body: collection});
    expect(seen).toEqual(['https://aviationweather.gov/api/data/gairmet?format=geojson']);
  });

  test('a bad request is a 400 and never fetches', async () => {
    let called = false;
    for (const s of ['', '?kind=metar', '?kind=sigmet&kind=isigmet', '?kind=sigmet&x=1']) {
      const out = await relayHazards(s, async () => { called = true; return new Response(collection); });
      expect(out.status, s).toBe(400);
    }
    expect(called).toBe(false);
  });

  test('an upstream failure, timeout, non-JSON or non-collection answer is a 502', async () => {
    expect((await relayHazards('?kind=sigmet', async () => new Response('x', {status: 500}))).status).toBe(502);
    expect((await relayHazards('?kind=sigmet', async () => new Response('', {status: 204}))).status).toBe(502);
    expect((await relayHazards('?kind=sigmet', async () => { throw new Error('offline'); })).status).toBe(502);
    expect((await relayHazards('?kind=sigmet', async () => { throw new DOMException('timed out', 'TimeoutError'); })).status).toBe(502);
    expect((await relayHazards('?kind=sigmet', async () => new Response('<html>', {status: 200}))).status).toBe(502);
    expect((await relayHazards('?kind=sigmet', async () => new Response('null', {status: 200}))).status).toBe(502);
    expect((await relayHazards('?kind=sigmet', async () => new Response('[]', {status: 200}))).status).toBe(502);
    expect((await relayHazards('?kind=sigmet', async () => new Response('{"type":"Feature"}', {status: 200}))).status).toBe(502);
  });

  test('passes a timeout signal to the fetch', async () => {
    let signal: AbortSignal | null | undefined;
    await relayHazards('?kind=sigmet', async (_url, init) => { signal = init?.signal; return new Response(collection); });
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
