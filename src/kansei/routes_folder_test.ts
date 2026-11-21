// createKanseiRoutes over a made-up X-Plane folder: the index builds in the background, 503 until it is ready.
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, expect, test, vi} from 'vitest';
import {indexAptFiles} from './apt.ts';
import {createKanseiRoutes, parseAtc} from './routes.ts';
import type {KanseiFolderRoutes} from './routes.ts';

const APT = [
  'I', '1200 Version - made up', '',
  '1 213 0 0 XAAA Alpha Intl',
  '1302 icao_code XAAA',
  '100 40.00 1 0 0.25 1 2 0 08 42.00000000 -95.00000000 0 0 3 0 0 0 26 42.02000000 -95.04000000 0 0 3 0 0 0',
  '',
  '1 80 0 0 XBBB Bravo Field',
  '100 30 1 0 0.25 1 2 0 09 45.00000000 -73.00000000 0 0 3 0 0 0 27 45.00000000 -72.97000000 0 0 3 0 0 0',
  '',
  '99', '',
].join('\n');
const ATC = [
  'CONTROLLER', 'NAME Alpha Tower', 'FACILITY_ID XAAA', 'ROLE twr', 'FREQ 11860',
  'AIRSPACE_POLYGON_BEGIN 0 3000', 'POINT 41 -96', 'POINT 41 -94', 'POINT 43 -94', 'POINT 43 -96', 'AIRSPACE_POLYGON_END',
  'CONTROLLER_END', '',
].join('\n');

function put(root: string, parts: string[], text: string): void {
  const file = join(root, ...parts);
  mkdirSync(dirname(file), {recursive: true});
  writeFileSync(file, text);
}

function tree(opts: {apt?: boolean; atc?: boolean} = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'folder-'));
  if (opts.apt !== false) put(root, ['Global Scenery', 'Global Airports', 'Earth nav data', 'apt.dat'], APT);
  if (opts.atc !== false) put(root, ['Custom Data', '1200 atc data', 'Earth nav data', 'atc.dat'], ATC);
  put(root, ['Custom Data', 'earth_fix.dat'], ' 42.500000000  -95.500000000  QXONE ENRT K2 4530000 QXONE\n');
  put(root, ['Custom Data', 'earth_nav.dat'], '');
  put(root, ['Custom Data', 'earth_msa.dat'], ' 1  XAAA K2 XAAA M 180 051 25 000 000  0\n');
  put(root, ['Custom Data', 'CIFP', 'XAAA.dat'], 'RWY:RW08,+0000,      ,00100, ,IXYZ,9,   ;N42000000,W095000000,0000;\n');
  return root;
}

const servers: http.Server[] = [];
const routesMade: KanseiFolderRoutes[] = [];
afterEach(async () => {
  for (const r of routesMade.splice(0)) r.close();
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((done) => (s.closeAllConnections(), s.close(() => done())))));
});

async function serve(routes: KanseiFolderRoutes): Promise<string> {
  routesMade.push(routes);
  const server = http.createServer((req, res) => {
    if (!routes.handle(req, res, req.url ?? '')) {
      res.writeHead(404);
      res.end('host 404');
    }
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function get(base: string, path: string): Promise<{status: number; body: unknown}> {
  const res = await fetch(base + path);
  return {status: res.status, body: await res.json()};
}

test('answers 503 while indexing, plans at once, then the full status', async () => {
  const root = tree();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const routes = createKanseiRoutes({
    xplaneRoot: root,
    plansDir: join(root, 'plans'),
    deps: {indexAptFiles: async (paths) => (await gate, indexAptFiles(paths))},
  });
  const base = await serve(routes);
  expect(await get(base, '/status')).toEqual({status: 503, body: {error: 'indexing'}});
  expect(await get(base, '/airport/XAAA')).toEqual({status: 503, body: {error: 'indexing'}});
  expect(routes.status()).toEqual({error: 'indexing'});
  expect(await get(base, '/plans')).toEqual({status: 200, body: {plans: []}});
  release();
  await routes.ready;
  const status = await get(base, '/status');
  expect(status).toEqual({status: 200, body: {ok: true, airports: 2, controllers: 1, ready: true, root, cifp: true, atc: true, msa: true}});
  expect(routes.status()).toEqual(status.body);
  const copy = routes.status() as {ready: boolean};
  copy.ready = false;
  expect(routes.status()).toMatchObject({ready: true});
  expect((await get(base, '/airport/XAAA')).status).toBe(200);
  expect(await get(base, '/airport/ZZZZ')).toEqual({status: 404, body: {error: 'No such airport'}});
  expect(await get(base, '/controllers?lat=42&lon=-95&altFt=1000')).toMatchObject({status: 200, body: [{name: 'Alpha Tower'}]});
  expect((await get(base, '/msa/XAAA')).status).toBe(200);
});

test('no atc.dat: no controllers, atc false', async () => {
  const routes = createKanseiRoutes({xplaneRoot: tree({atc: false})});
  const base = await serve(routes);
  await routes.ready;
  expect(await get(base, '/controllers?lat=42&lon=-95&altFt=1000')).toEqual({status: 200, body: []});
  expect(routes.status()).toMatchObject({atc: false, controllers: 0});
});

test('no earth_msa.dat: msa false and MSA answers []', async () => {
  const root = tree();
  const routes = createKanseiRoutes({xplaneRoot: root});
  await routes.ready;
  expect(routes.status()).toMatchObject({msa: true});
  const bare = mkdtempSync(join(tmpdir(), 'folder-'));
  put(bare, ['Global Scenery', 'Global Airports', 'Earth nav data', 'apt.dat'], APT);
  const noMsa = createKanseiRoutes({xplaneRoot: bare});
  const base = await serve(noMsa);
  await noMsa.ready;
  expect(noMsa.status()).toMatchObject({msa: false, cifp: false, atc: false});
  expect(await get(base, '/msa/XAAA')).toEqual({status: 200, body: []});
});

test('no apt files: no airports', async () => {
  const routes = createKanseiRoutes({xplaneRoot: tree({apt: false})});
  const base = await serve(routes);
  await routes.ready;
  expect(await get(base, '/airports/near?lat=42&lon=-95')).toEqual({status: 200, body: []});
  expect(await get(base, '/airport/XAAA')).toEqual({status: 404, body: {error: 'No such airport'}});
  expect(routes.status()).toMatchObject({airports: 0});
});

test('one build for concurrent first requests', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const spy = vi.fn(async (paths: readonly string[]) => (await gate, indexAptFiles(paths)));
  const routes = createKanseiRoutes({xplaneRoot: tree(), deps: {indexAptFiles: spy}});
  const base = await serve(routes);
  const answers = await Promise.all(Array.from({length: 20}, () => get(base, '/airport/XAAA')));
  expect(answers.every((a) => a.status === 503)).toBe(true);
  release();
  await routes.ready;
  expect(spy).toHaveBeenCalledTimes(1);
});

test('build failure: lookups and status answer 500, ready rejects', async () => {
  const routes = createKanseiRoutes({
    xplaneRoot: tree(),
    deps: {indexAptFiles: () => Promise.reject(new Error('boom'))},
  });
  const base = await serve(routes);
  await expect(routes.ready).rejects.toThrow('boom');
  expect(await get(base, '/airport/XAAA')).toEqual({status: 500, body: {error: 'index failed'}});
  expect(await get(base, '/status')).toEqual({status: 500, body: {error: 'index failed'}});
  expect(routes.status()).toEqual({error: 'index failed'});
});

test('close during the build: ready rejects with closed and lookups answer 503 indexing', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const routes = createKanseiRoutes({xplaneRoot: tree(), deps: {indexAptFiles: async (paths) => (await gate, indexAptFiles(paths))}});
  const base = await serve(routes);
  routes.close();
  release();
  await expect(routes.ready).rejects.toThrow('closed');
  expect(await get(base, '/airport/XAAA')).toEqual({status: 503, body: {error: 'indexing'}});
  expect(await get(base, '/status')).toEqual({status: 503, body: {error: 'indexing'}});
  expect(routes.status()).toEqual({error: 'indexing'});
});

test('close during a build that then fails: ready still rejects with closed', async () => {
  let fail: () => void = () => undefined;
  const gate = new Promise<void>((_, reject) => (fail = () => reject(new Error('boom'))));
  const routes = createKanseiRoutes({xplaneRoot: tree(), deps: {indexAptFiles: async () => (await gate, [])}});
  const base = await serve(routes);
  routes.close();
  fail();
  await expect(routes.ready).rejects.toThrow('closed');
  expect(await get(base, '/status')).toEqual({status: 503, body: {error: 'indexing'}});
});

test('close after a failure: lookups and status answer 503 indexing', async () => {
  const routes = createKanseiRoutes({xplaneRoot: tree(), deps: {indexAptFiles: () => Promise.reject(new Error('boom'))}});
  const base = await serve(routes);
  await expect(routes.ready).rejects.toThrow('boom');
  routes.close();
  expect(await get(base, '/airport/XAAA')).toEqual({status: 503, body: {error: 'indexing'}});
  expect(await get(base, '/status')).toEqual({status: 503, body: {error: 'indexing'}});
  expect(routes.status()).toEqual({error: 'indexing'});
});

test('close drops the index', async () => {
  const routes = createKanseiRoutes({xplaneRoot: tree()});
  const base = await serve(routes);
  await routes.ready;
  routes.close();
  expect(await get(base, '/airport/XAAA')).toEqual({status: 503, body: {error: 'indexing'}});
  expect(await get(base, '/status')).toEqual({status: 503, body: {error: 'indexing'}});
  expect(await get(base, '/plans')).toEqual({status: 403, body: {error: 'Plan saving is off'}});
});

test('parseAtc is re-exported for hosts without a folder', () => {
  expect(parseAtc(ATC)).toMatchObject([{name: 'Alpha Tower', facilityId: 'XAAA', khz: [118600]}]);
});
