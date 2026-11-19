import {afterEach, describe, expect, test} from 'vitest';
import {fakeKuukouHandler, startFakeKuukou} from './fake-server.ts';
import type {FakeKuukou} from './fake-server.ts';

// Made-up folder contents. Nothing here is copied from real data.
const files = {
  xplane: {'earth_nav.dat': 'I\n1200 Version - made-up\n99\n', 'CIFP/KTST.dat': 'RWY:RW09;\n'},
  jeppesen: {'TerminalCharts/Charts.bin': '0123456789'},
};
const call = (path: string, init?: RequestInit) => fakeKuukouHandler(files)(new Request(`http://fake${path}`, init));

describe('fakeKuukouHandler', () => {
  test('answers the server check', async () => {
    const r = await call('/kuukou/api/server');
    expect(await r.json()).toMatchObject({server: 'kuukou', folders: {xplane: {ok: true}, jeppesen: {ok: true}}});
  });

  test('lists a folder manifest with sizes', async () => {
    const r = await call('/kuukou/api/files/xplane/?manifest');
    expect(await r.json()).toEqual([{path: 'CIFP/KTST.dat', size: 10}, {path: 'earth_nav.dat', size: 28}]);
  });

  test('serves a whole file, and a byte range as 206 with Content-Range', async () => {
    expect(await (await call('/kuukou/api/files/xplane/CIFP/KTST.dat')).text()).toBe('RWY:RW09;\n');
    const r = await call('/kuukou/api/files/jeppesen/TerminalCharts/Charts.bin', {headers: {range: 'bytes=2-5'}});
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await r.text()).toBe('2345');
  });

  test('matches file names case-insensitively', async () => {
    expect((await call('/kuukou/api/files/jeppesen/terminalcharts/charts.BIN')).status).toBe(200);
  });

  test('answers 404 for unknown paths and 416 for a range past the end', async () => {
    expect((await call('/kuukou/api/files/xplane/../secret')).status).toBe(404);
    expect((await call('/kuukou/api/files/xplane/missing.dat')).status).toBe(404);
    expect((await call('/elsewhere')).status).toBe(404);
    expect((await call('/kuukou/api/files/jeppesen/TerminalCharts/Charts.bin', {headers: {range: 'bytes=20-30'}})).status).toBe(416);
  });
});

describe('fakeKuukouHandler, as the real server behaves', () => {
  const more = {
    xplane: {'earth_nav.dat': '0123456789', 'plugins/evil.dll': 'x'},
    jeppesen: {'TerminalCharts/Charts.bin': '0123456789', 'TerminalCharts/charts.dbf': 'dbf', 'Other/readme.txt': 'x', 'Data1/Obstacle12.J3N': 'abc'},
  };
  const get = (path: string, init?: RequestInit) => fakeKuukouHandler(more)(new Request(`http://fake${path}`, init));

  test('answers 404 for a malformed escape instead of failing', async () => {
    expect((await get('/kuukou/api/files/xplane/%')).status).toBe(404);
  });

  test('serves and lists only the allow-listed files', async () => {
    expect((await get('/kuukou/api/files/xplane/plugins/evil.dll')).status).toBe(404);
    expect((await get('/kuukou/api/files/jeppesen/Other/readme.txt')).status).toBe(404);
    expect((await get('/kuukou/api/files/jeppesen/Data1/Obstacle12.J3N')).status).toBe(200);
    expect((await (await get('/kuukou/api/files/xplane/?manifest')).json())).toEqual([{path: 'earth_nav.dat', size: 10}]);
  });

  test('honours Range only on .bin, .J3N and .J3G, including a suffix range', async () => {
    const r = await get('/kuukou/api/files/jeppesen/TerminalCharts/Charts.bin', {headers: {range: 'bytes=-3'}});
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe('bytes 7-9/10');
    expect((await get('/kuukou/api/files/xplane/earth_nav.dat', {headers: {range: 'bytes=0-1'}})).status).toBe(200);
    expect((await get('/kuukou/api/files/jeppesen/TerminalCharts/charts.dbf', {headers: {range: 'bytes=0-1'}})).status).toBe(200);
  });
});

describe('startFakeKuukou', () => {
  let server: FakeKuukou | undefined;
  afterEach(async () => { await server?.close(); });

  test('serves the same answers over real HTTP', async () => {
    server = await startFakeKuukou(files);
    const r = await fetch(`${server.url}/kuukou/api/server`);
    expect((await r.json()).server).toBe('kuukou');
  });
});
