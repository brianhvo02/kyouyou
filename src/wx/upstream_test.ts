import {describe, expect, test} from 'vitest';
import {relayWx, wxUpstream} from './upstream.ts';

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
