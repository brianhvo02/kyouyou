// Ported from Kansei's helper tests (stage-2b-voice): the data routes and the plan routes, mounted under a prefix.
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import net from 'node:net';
import {copyFile, link, rename} from 'node:fs/promises';
import {mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest';
import {indexAptFiles} from './apt.ts';
import {indexFixes} from './fixes.ts';
import {createKanseiRoutesFromData, PLAN_LIMIT_BYTES} from './routes.ts';
import type {KanseiData, KanseiRoutesOptions, PlanFsOps} from './routes.ts';
import type {Controller} from './types.ts';

const APT = [
  'I', '1200 Version - made up', '',
  '1 213 0 0 XAAA Alpha Intl',
  '1302 icao_code XAAA',
  '100 40.00 1 0 0.25 1 2 0 08 42.00000000 -95.00000000 0 0 3 0 0 0 26 42.02000000 -95.04000000 0 0 3 0 0 0',
  '1053 122175 GND',
  '1054 118600 TWR',
  '',
  '1 80 0 0 XBBB Bravo Field',
  '100 30 1 0 0.25 1 2 0 09 45.00000000 -73.00000000 0 0 3 0 0 0 27 45.00000000 -72.97000000 0 0 3 0 0 0',
  '',
  '99', '',
].join('\n');

const square = (lat: number, lon: number): Controller['areas'][number]['ring'] => [
  {lat: lat - 1, lon: lon - 1}, {lat: lat - 1, lon: lon + 1}, {lat: lat + 1, lon: lon + 1}, {lat: lat + 1, lon: lon - 1},
];
const CONTROLLERS: Controller[] = [
  {name: 'Alpha Tower', facilityId: 'XAAA', role: 'twr', khz: [118600], areas: [{floorFt: 0, ceilingFt: 3000, ring: square(42, -95)}]},
  {name: 'Far Center', facilityId: 'ZFAR', role: 'ctr', khz: [132000], areas: [{floorFt: 0, ceilingFt: 60000, ring: square(10, 10)}]},
];

const CIFP_AAA = [
  'RWY:RW08,+0000,      ,00100, ,IXYZ,9,   ;N42000000,W095000000,0000;',
  'SID:010,1,TESTT2,RW08,QXONE,K2,P,C,E   , ,   ,TF, , , , , ,      ,    ,    ,    ,    , ,     ,     ,18000, ,   ,    ,   , , , , , , , , ;',
].join('\n');
const MSA_AAA = ' 1  XAAA K2 XAAA M 180 051 25 000 000  0\n 1  XBBB K2 XBBB M 180 099 25 000 000  0\n';
const FIXES = indexFixes(' 42.500000000  -95.500000000  QXONE ENRT K2 4530000 QXONE\n', '');

const ORIGIN = 'http://localhost:5173';
const servers: http.Server[] = [];
let data: KanseiData;
let base = '';

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));
}

function closed(server: http.Server): Promise<void> {
  return new Promise((resolve) => (server.closeAllConnections(), server.close(() => resolve())));
}

/** A bare host: strips `/x` and hands the rest to the handler, answers 404 itself when the handler declines. */
function mount(routesData: KanseiData, opts: KanseiRoutesOptions = {}): http.Server {
  const routes = createKanseiRoutesFromData(routesData, opts);
  const server = http.createServer((req, res) => {
    const url = req.url ?? '';
    if (url.startsWith('/x/') || url === '/x') {
      if (routes.handle(req, res, url.slice('/x'.length))) return;
    }
    res.writeHead(404, {'content-type': 'text/plain'});
    res.end('host 404');
  });
  servers.push(server);
  return server;
}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'routes-'));
  const aptPath = join(dir, 'apt.dat');
  writeFileSync(aptPath, APT);
  const index = await indexAptFiles([aptPath]);
  data = {index, controllers: CONTROLLERS, readCifp: async (id) => (id === 'XAAA' ? CIFP_AAA : null), fixes: FIXES, msaText: MSA_AAA};
  base = `http://127.0.0.1:${await listen(mount(data))}/x`;
});

afterEach(async () => {
  await Promise.all(servers.splice(1).map(closed));
});

afterAll(async () => {
  await Promise.all(servers.splice(0).map(closed));
});

test('status reports the counts', async () => {
  const res = await fetch(`${base}/status`);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('content-type')).toContain('application/json');
  expect(await res.json()).toEqual({ok: true, airports: 2, controllers: 2});
});

test('airport returns one airport and 404 for an unknown id', async () => {
  const res = await fetch(`${base}/airport/xaaa`);
  expect(res.status).toBe(200);
  const airport = (await res.json()) as {id: string; runways: unknown[]};
  expect(airport.id).toBe('XAAA');
  expect(airport.runways).toHaveLength(1);
  const missing = await fetch(`${base}/airport/NOPE`);
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({error: 'No such airport'});
});

test('airports/near returns nearest first with distances', async () => {
  const res = await fetch(`${base}/airports/near?lat=42.1&lon=-95.1`);
  const list = (await res.json()) as {id: string; distanceNm: unknown}[];
  expect(list.map((a) => a.id)).toEqual(['XAAA']);
  expect(typeof list[0]?.distanceNm).toBe('number');
  expect(await (await fetch(`${base}/airports/near?lat=42.1&lon=-95.1&nm=1`)).json()).toEqual([]);
  // nm is capped at 100: XBBB is about 450 nm from here, so even a huge nm does not reach it.
  expect(await (await fetch(`${base}/airports/near?lat=43&lon=-83&nm=5000`)).json()).toEqual([]);
});

test('controllers returns those covering the position', async () => {
  const res = await fetch(`${base}/controllers?lat=42&lon=-95&altFt=1000`);
  expect(await res.json()).toEqual([{name: 'Alpha Tower', facilityId: 'XAAA', role: 'twr', khz: [118600], floorFt: 0, ceilingFt: 3000}]);
  expect(await (await fetch(`${base}/controllers?lat=42&lon=-95&altFt=9000`)).json()).toEqual([]);
});

test('controllers carry the matching area floor and ceiling', async () => {
  const body = (await (await fetch(`${base}/controllers?lat=42&lon=-95&altFt=2500`)).json()) as {floorFt: number; ceilingFt: number}[];
  expect(body[0]).toMatchObject({floorFt: 0, ceilingFt: 3000});
});

test('serves an airport\'s procedures', async () => {
  const res = await fetch(`${base}/procedures/xaaa`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as {id: string; procedures: {name: string; common: {name: string; legs: {fix: string; lat: number}[]}[]}[]; runways: unknown[]};
  expect(body.id).toBe('XAAA');
  expect(body.runways).toEqual([{name: '08', lat: 42, lon: -95}]);
  expect(body.procedures[0]?.name).toBe('TESTT2');
  expect(body.procedures[0]?.common[0]?.name).toBe('08');
  expect(body.procedures[0]?.common[0]?.legs[0]).toMatchObject({fix: 'QXONE', lat: 42.5});
});

test('answers 404 for an airport with no procedure file', async () => {
  for (const id of ['XBBB', 'NOPE', '..%2Fx']) {
    const res = await fetch(`${base}/procedures/${id}`);
    expect(res.status, id).toBe(404);
    expect(await res.json()).toHaveProperty('error');
  }
});

test('serves MSAs, empty when the airport has none', async () => {
  const body = (await (await fetch(`${base}/msa/XAAA`)).json()) as {centre: string; lat: number; sectors: {ft: number}[]}[];
  expect(body).toHaveLength(1);
  expect(body[0]).toMatchObject({centre: 'XAAA', sectors: [{ft: 5100}]});
  expect(body[0]?.lat).toBeCloseTo(42.01, 3);
  expect(await (await fetch(`${base}/msa/XNONE`)).json()).toEqual([]);
  const bbb = (await (await fetch(`${base}/msa/XBBB`)).json()) as {centre: string; sectors: unknown[]}[];
  expect(bbb).toHaveLength(1);
  expect(bbb[0]).toMatchObject({centre: 'XBBB', sectors: [{fromDeg: 180, ft: 9900, radiusNm: 25}]});
});

test('a bad position is a 400', async () => {
  for (const query of [
    'airports/near?lat=abc&lon=1', 'airports/near?lat=91&lon=1', 'airports/near?lat=1', 'airports/near?lat=&lon=1',
    'airports/near?lat=1&lon=181', 'controllers?lat=1&lon=1', 'controllers?lat=1&lon=1&altFt=x',
  ]) {
    const res = await fetch(`${base}/${query}`);
    expect(res.status, query).toBe(400);
    expect(await res.json()).toEqual({error: 'Bad position'});
  }
});

test('anything else is declined and the host answers 404; lookups other than GET are 404', async () => {
  for (const path of ['/', '/nothing', '/apix', '/statusx', '/plansx']) {
    const res = await fetch(`${base}${path}`);
    expect(res.status, path).toBe(404);
    expect(await res.text(), path).toBe('host 404');
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
    const res = await fetch(`${base}/status`, {method});
    expect(res.status, method).toBe(404);
  }
  const post = await fetch(`${base}/airport/XAAA`, {method: 'POST'});
  expect(await post.json()).toEqual({error: 'Not found'});
});

test('the handler adds no CORS or private-network headers and does not answer OPTIONS itself', async () => {
  const res = await fetch(`${base}/status`, {headers: {origin: ORIGIN}});
  expect(res.headers.get('access-control-allow-origin')).toBeNull();
  expect(res.headers.get('access-control-allow-private-network')).toBeNull();
  const options = await fetch(`${base}/status`, {method: 'OPTIONS', headers: {origin: ORIGIN}});
  expect(options.status).toBe(404);
  expect(options.headers.get('access-control-allow-methods')).toBeNull();
});

// ---- plan routes ----

const FMS = ['I', '1100 Version', 'CYCLE 2611', 'ADEP XAAA', 'ADES XBBB', 'NUMENR 2', '1 XAAA ADEP 0.000000 42.000000 -95.000000', '1 XBBB ADES 0.000000 45.000000 -73.000000', ''].join('\n');
const UPLINK = '<?xml version="1.0"?>\n<OFP>\n  <general/>\n</OFP>\n';

interface Plans {
  /** A temporary folder that holds everything the test may touch; plansDir is deep inside it. */
  sandbox: string;
  plansDir: string;
  port: number;
  errors: Error[];
}

async function startPlans(withDir = true, fsOps?: Partial<PlanFsOps>): Promise<Plans> {
  const sandbox = mkdtempSync(join(tmpdir(), 'plans-'));
  const plansDir = join(sandbox, 'xplane', 'Output', 'FMS plans');
  const errors: Error[] = [];
  const server = mount(data, {...(withDir ? {plansDir} : {}), onPlanError: (e) => errors.push(e), fsOps: {pause: () => Promise.resolve(), ...fsOps}});
  return {sandbox, plansDir, port: await listen(server), errors};
}

interface Raw {
  status: number;
  head: string;
  body: string;
}

/** A request with a literal path and headers, over a raw socket, so nothing normalises or refuses the path. */
function raw(port: number, method: string, path: string, opts: {origin?: string | null; body?: Buffer | string; contentLength?: number} = {}): Promise<Raw> {
  const origin = opts.origin === undefined ? ORIGIN : opts.origin;
  const body = Buffer.from(opts.body ?? '');
  const lines = [`${method} ${path} HTTP/1.1`, `Host: 127.0.0.1:${port}`, 'Connection: close', `Content-Length: ${opts.contentLength ?? body.length}`];
  if (origin !== null) lines.push(`Origin: ${origin}`);
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const chunks: Buffer[] = [];
    socket.on('error', () => undefined);
    socket.on('data', (c) => chunks.push(c));
    socket.on('close', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const cut = text.indexOf('\r\n\r\n');
      if (cut < 0) return reject(new Error(`no response: ${JSON.stringify(text)}`));
      const head = text.slice(0, cut);
      let body = text.slice(cut + 4);
      if (/^transfer-encoding: chunked/im.test(head)) {
        let plain = '';
        for (let rest = body; rest !== '' && !rest.startsWith('0\r\n'); ) {
          const eol = rest.indexOf('\r\n');
          const size = parseInt(rest.slice(0, eol), 16);
          plain += rest.slice(eol + 2, eol + 2 + size);
          rest = rest.slice(eol + 2 + size + 2);
        }
        body = plain;
      }
      resolve({status: Number(text.split(' ')[1]), head, body});
    });
    socket.on('connect', () => {
      socket.write(Buffer.concat([Buffer.from(lines.join('\r\n') + '\r\n\r\n'), body]));
    });
  });
}

/** Every path under a folder, relative, sorted. */
function tree(dir: string): string[] {
  return (readdirSync(dir, {recursive: true}) as string[]).sort();
}

const put = (p: Plans, name: string, body: Buffer | string = FMS, query = '', origin?: string | null): Promise<Raw> =>
  raw(p.port, 'PUT', `/x/plans/${name}${query}`, {body, origin});

test('plan saving is off unless a plans folder is given', async () => {
  const p = await startPlans(false);
  const before = tree(p.sandbox);
  const a = await put(p, 'A.fms');
  expect(a.status).toBe(403);
  expect(JSON.parse(a.body)).toEqual({error: 'Plan saving is off'});
  const b = await raw(p.port, 'GET', '/x/plans');
  expect(b.status).toBe(403);
  expect(JSON.parse(b.body)).toEqual({error: 'Plan saving is off'});
  expect(tree(p.sandbox)).toEqual(before);
});

test('saves a new plan and answers 201', async () => {
  const p = await startPlans();
  const res = await put(p, 'A.fms');
  expect(res.status).toBe(201);
  expect(JSON.parse(res.body)).toEqual({saved: 'A.fms'});
  expect(readFileSync(join(p.plansDir, 'A.fms'))).toEqual(Buffer.from(FMS));
  expect(readdirSync(p.plansDir)).toEqual(['A.fms']);
});

test('a second save of the same name is 409 and leaves the file alone', async () => {
  const p = await startPlans();
  await put(p, 'A.fms');
  const res = await put(p, 'A.fms', FMS.replace('CYCLE 2611', 'CYCLE 2612'));
  expect(res.status).toBe(409);
  expect(JSON.parse(res.body)).toEqual({error: 'exists'});
  expect(readFileSync(join(p.plansDir, 'A.fms'), 'utf8')).toBe(FMS);
  expect(readdirSync(p.plansDir)).toEqual(['A.fms']);
});

test('overwrite=1 replaces the file and answers 200', async () => {
  const p = await startPlans();
  await put(p, 'A.fms');
  const other = FMS.replace('CYCLE 2611', 'CYCLE 2612');
  const res = await put(p, 'A.fms', other, '?overwrite=1');
  expect(res.status).toBe(200);
  expect(JSON.parse(res.body)).toEqual({saved: 'A.fms'});
  expect(readFileSync(join(p.plansDir, 'A.fms'), 'utf8')).toBe(other);
  expect((await put(p, 'B.fms', FMS, '?overwrite=1')).status).toBe(201);
  expect(readdirSync(p.plansDir).sort()).toEqual(['A.fms', 'B.fms']);
});

test('a PUT with no Origin is 403 and writes nothing', async () => {
  const p = await startPlans();
  const before = tree(p.sandbox);
  const none = await put(p, 'A.fms', FMS, '', null);
  expect(none.status).toBe(403);
  expect(JSON.parse(none.body)).toEqual({error: 'Origin required'});
  expect(tree(p.sandbox)).toEqual(before);
});

test('refuses bad names', async () => {
  const p = await startPlans();
  const before = tree(p.sandbox);
  const names = [
    '../x.fms', '..%2Fx.fms', 'a/b.fms', 'a%2Fb.fms', 'a\\b.fms', 'x.fms.', 'x .fms', 'x.fms%20', '.fms', 'a'.repeat(33) + '.fms',
    'x.txt', 'x.FMS', 'NUL.fms', 'con.fms', 'COM1.fms', 'lpt9.fms', 'COM0.fms', 'lpt0.fms', 'other.xml', '', 'B738X.xml', 'b738x.xml.', 'x.fms\n', '%2e%2e/x.fms',
  ];
  for (const name of names) {
    const res = await put(p, name);
    expect(res.status, JSON.stringify(name)).toBe(400);
    // A space or a line break in the request line never reaches the route: Node's parser refuses the request itself.
    if (!/[ \n]/.test(name)) expect(JSON.parse(res.body), JSON.stringify(name)).toEqual({error: 'Bad plan name'});
  }
  const climb = await raw(p.port, 'PUT', '/x/plans/../../x.fms', {body: FMS});
  expect(climb.status).toBe(400);
  expect(tree(p.sandbox)).toEqual(before);
  expect(readdirSync(p.sandbox)).toEqual([]);
});

test('refuses path tricks', async () => {
  const p = await startPlans();
  const before = tree(p.sandbox);
  const airport = await raw(p.port, 'GET', '/x/airport/..%2F..%2Fx');
  expect(airport.status).toBe(404);
  expect(JSON.parse(airport.body)).toEqual({error: 'No such airport'});
  for (const name of ['..%2Fx.fms', 'CON.fms']) {
    const res = await put(p, name);
    expect(res.status, name).toBe(400);
    expect(JSON.parse(res.body), name).toEqual({error: 'Bad plan name'});
  }
  expect(tree(p.sandbox)).toEqual(before);
  expect(readdirSync(p.sandbox)).toEqual([]);
});

test('accepts the longest name and names with digits, underscores and hyphens', async () => {
  const p = await startPlans();
  for (const name of ['a'.repeat(32) + '.fms', 'XAAA_XBBB-2.fms', 'CON1.fms', 'NULL.fms', 'COM10.fms']) {
    expect((await put(p, name)).status, name).toBe(201);
  }
});

test('refuses a body that is not a flight plan, with the parser\'s reason', async () => {
  const p = await startPlans();
  const res = await put(p, 'A.fms', 'hello\n');
  expect(res.status).toBe(400);
  expect((JSON.parse(res.body) as {error: string}).error).toMatch(/^Not a flight plan: .+/);
  const bad = await put(p, 'A.fms', Buffer.from([0xff, 0xfe, 0x41]));
  expect(bad.status).toBe(400);
  expect((JSON.parse(bad.body) as {error: string}).error).toMatch(/^Not a flight plan: /);
  expect(readdirSync(p.sandbox)).toEqual([]);
});

test('refuses an oversize body with 413 without writing', async () => {
  expect(PLAN_LIMIT_BYTES).toBe(262144);
  const p = await startPlans();
  const res = await put(p, 'A.fms', Buffer.alloc(262145, 0x20));
  expect(res.status).toBe(413);
  expect(JSON.parse(res.body)).toEqual({error: 'Plan too large'});
  // A content-length over the limit is refused before the body is read.
  expect((await raw(p.port, 'PUT', '/x/plans/A.fms', {contentLength: 999999})).status).toBe(413);
  // Exactly the limit is not refused for size (it fails as a plan instead).
  expect((await put(p, 'A.fms', Buffer.alloc(262144, 0x20))).status).toBe(400);
  expect(tree(p.sandbox).filter((f) => f.endsWith('.fms'))).toEqual([]);
});

test('a refusal closes the connection', async () => {
  const p = await startPlans();
  const res = await put(p, 'x.txt');
  expect(res.status).toBe(400);
  expect(res.head.toLowerCase()).toContain('connection: close');
});

test('saves b738x.xml when it looks like an uplink file and refuses it otherwise', async () => {
  const p = await startPlans();
  const ok = await put(p, 'b738x.xml', UPLINK);
  expect(ok.status).toBe(201);
  expect(JSON.parse(ok.body)).toEqual({saved: 'b738x.xml'});
  expect(readFileSync(join(p.plansDir, 'b738x.xml'), 'utf8')).toBe(UPLINK);
  expect((await put(p, 'b738x.xml', UPLINK, '?overwrite=1')).status).toBe(200);
  expect((await put(p, 'b738x.xml', UPLINK)).status).toBe(409);
  const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('  <OFP version="1">x</OFP>  \n')]);
  expect((await put(p, 'b738x.xml', withBom, '?overwrite=1')).status).toBe(200);
  const bads = ['hello', '<?xml version="1.0"?><NOPE></NOPE>', '<?xml version="1.0"?><OFP>x', '<OFP>x</OFP>y', '<?xml?><OFPX>x</OFP>', '<OFP>\0</OFP>', ''];
  for (const bad of bads) {
    const res = await put(p, 'b738x.xml', bad, '?overwrite=1');
    expect(res.status, JSON.stringify(bad)).toBe(400);
    expect(JSON.parse(res.body)).toEqual({error: 'Not an uplink file'});
  }
  expect(readdirSync(p.plansDir)).toEqual(['b738x.xml']);
});

test('refuses any query other than overwrite=1', async () => {
  const p = await startPlans();
  for (const query of ['?overwrite=0', '?overwrite=1&x=1', '?x=1', '?overwrite', '?', '?overwrite=1%20', '?Overwrite=1']) {
    const res = await put(p, 'A.fms', FMS, query);
    expect(res.status, query).toBe(400);
    expect(JSON.parse(res.body), query).toEqual({error: 'Bad query'});
  }
  expect(tree(p.sandbox).filter((f) => f.endsWith('.fms'))).toEqual([]);
});

test('lists the saved plans, sorted, without temporary files or other files', async () => {
  const p = await startPlans();
  expect(JSON.parse((await raw(p.port, 'GET', '/x/plans', {origin: null})).body)).toEqual({plans: []});
  await put(p, 'b.fms');
  await put(p, 'A.fms');
  await put(p, 'b738x.xml', UPLINK);
  writeFileSync(join(p.plansDir, 'notes.txt'), 'x');
  writeFileSync(join(p.plansDir, '.kansei-1234.tmp'), 'x');
  writeFileSync(join(p.plansDir, 'other.xml'), 'x');
  mkdirSync(join(p.plansDir, 'dir.fms'));
  const res = await raw(p.port, 'GET', '/x/plans', {origin: null});
  expect(res.status).toBe(200);
  expect(JSON.parse(res.body)).toEqual({plans: ['A.fms', 'b.fms', 'b738x.xml']});
});

test('other methods on the plan paths are 405', async () => {
  const p = await startPlans();
  for (const method of ['POST', 'DELETE', 'PATCH']) {
    for (const path of ['/x/plans', '/x/plans/A.fms']) {
      expect((await raw(p.port, method, path, {body: FMS})).status, `${method} ${path}`).toBe(405);
    }
  }
  expect((await raw(p.port, 'GET', '/x/plans/A.fms')).status).toBe(405);
  expect((await raw(p.port, 'PUT', '/x/plans', {body: FMS})).status).toBe(405);
  expect(tree(p.sandbox).filter((f) => f.endsWith('.fms'))).toEqual([]);
});

test('leaves no temporary file behind after a refused or failed save', async () => {
  const p = await startPlans();
  await put(p, 'A.fms');
  await put(p, 'A.fms'); // 409
  await put(p, 'B.fms', 'nope'); // 400
  await put(p, 'b738x.xml', 'nope'); // 400
  expect(readdirSync(p.plansDir)).toEqual(['A.fms']);
  // A save that fails in the file system: the name is taken by a folder.
  mkdirSync(join(p.plansDir, 'D.fms'));
  const res = await put(p, 'D.fms', FMS, '?overwrite=1');
  expect(res.status).toBe(500);
  expect(JSON.parse(res.body)).toEqual({error: 'Could not save the plan'});
  expect(res.body).not.toContain(p.sandbox);
  expect(p.errors).toHaveLength(1);
  expect(readdirSync(p.plansDir).sort()).toEqual(['A.fms', 'D.fms']);
});

const errno = (code: string): NodeJS.ErrnoException => Object.assign(new Error(`${code}: injected`), {code});

test('a temp file that cannot be removed does not turn a saved plan into a failure', async () => {
  const p = await startPlans(true, {rm: () => Promise.reject(errno('EBUSY'))});
  const res = await put(p, 'A.fms');
  expect(res.status).toBe(201);
  expect(readFileSync(join(p.plansDir, 'A.fms'), 'utf8')).toBe(FMS);
  expect(p.errors).toHaveLength(1);
  expect(p.errors[0]?.message).toContain('EBUSY');
});

test('a client that drops mid-upload is not reported as a save failure', async () => {
  const p = await startPlans();
  await new Promise<void>((resolve) => {
    const socket = net.connect(p.port, '127.0.0.1', () => {
      socket.write(`PUT /x/plans/A.fms HTTP/1.1\r\nHost: 127.0.0.1:${p.port}\r\nOrigin: ${ORIGIN}\r\nContent-Length: 5000\r\n\r\n${FMS}`);
      setTimeout(() => socket.destroy(), 30);
    });
    socket.on('error', () => undefined);
    socket.on('close', () => setTimeout(resolve, 100));
  });
  expect(p.errors).toEqual([]);
  expect(tree(p.sandbox).filter((f) => f.endsWith('.fms'))).toEqual([]);
});

test('a leading byte-order mark is not written to the file', async () => {
  const p = await startPlans();
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  expect((await put(p, 'A.fms', Buffer.concat([bom, Buffer.from(FMS)]))).status).toBe(201);
  expect(readFileSync(join(p.plansDir, 'A.fms'))).toEqual(Buffer.from(FMS));
  expect((await put(p, 'b738x.xml', Buffer.concat([bom, Buffer.from(UPLINK)]))).status).toBe(201);
  expect(readFileSync(join(p.plansDir, 'b738x.xml'))).toEqual(Buffer.from(UPLINK));
  // Only one mark is removed; the rest is byte for byte.
  expect((await put(p, 'B.fms', Buffer.concat([bom, Buffer.from(FMS.replace('CYCLE 2611', 'CYCLE 2611\r'))]))).status).toBe(201);
  expect(readFileSync(join(p.plansDir, 'B.fms'), 'utf8')).toContain('CYCLE 2611\r\n');
});

test('a rename blocked a few times succeeds on a retry', async () => {
  let calls = 0;
  const p = await startPlans(true, {rename: (from, to) => (++calls <= 3 ? Promise.reject(errno('EBUSY')) : rename(from, to))});
  await put(p, 'A.fms');
  const other = FMS.replace('CYCLE 2611', 'CYCLE 2612');
  const res = await put(p, 'A.fms', other, '?overwrite=1');
  expect(res.status).toBe(200);
  expect(calls).toBe(4);
  expect(readFileSync(join(p.plansDir, 'A.fms'), 'utf8')).toBe(other);
  expect(p.errors).toEqual([]);
});

test('a rename that stays blocked ends in 500 and leaves the old file intact', async () => {
  let calls = 0;
  const p = await startPlans(true, {rename: () => (calls++, Promise.reject(errno('EPERM')))});
  await put(p, 'A.fms');
  const res = await put(p, 'A.fms', FMS.replace('CYCLE 2611', 'CYCLE 2612'), '?overwrite=1');
  expect(res.status).toBe(500);
  expect(calls).toBe(6);
  expect(readFileSync(join(p.plansDir, 'A.fms'), 'utf8')).toBe(FMS);
  expect(readdirSync(p.plansDir)).toEqual(['A.fms']);
  let other = 0;
  const q = await startPlans(true, {rename: () => (other++, Promise.reject(errno('ENOSPC')))});
  await put(q, 'A.fms');
  expect((await put(q, 'A.fms', FMS, '?overwrite=1')).status).toBe(500);
  expect(other).toBe(1);
});

test('falls back to an exclusive copy when hard links are not supported', async () => {
  let copies = 0;
  const p = await startPlans(true, {
    link: () => Promise.reject(errno('EPERM')),
    copyFile: (from, to, mode) => (copies++, copyFile(from, to, mode)),
  });
  const res = await put(p, 'A.fms');
  expect(res.status).toBe(201);
  expect(copies).toBe(1);
  expect(readdirSync(p.plansDir)).toEqual(['A.fms']);
  // The copy is still exclusive.
  const mid = await startPlans(true, {link: () => Promise.reject(errno('EPERM')), copyFile: () => Promise.reject(errno('EEXIST'))});
  expect((await put(mid, 'A.fms')).status).toBe(409);
  expect(readdirSync(mid.plansDir)).toEqual([]);
});

test('the exclusive put in place answers 409 when the file appears in the meantime', async () => {
  const p = await startPlans(true, {
    link: async (from, to) => {
      writeFileSync(to, 'appeared');
      return link(from, to);
    },
  });
  const res = await put(p, 'A.fms');
  expect(res.status).toBe(409);
  expect(JSON.parse(res.body)).toEqual({error: 'exists'});
  expect(readFileSync(join(p.plansDir, 'A.fms'), 'utf8')).toBe('appeared');
  expect(readdirSync(p.plansDir)).toEqual(['A.fms']);
  expect(p.errors).toEqual([]);
});

test('HEAD on the plan list answers like GET without a body', async () => {
  const p = await startPlans();
  await put(p, 'A.fms');
  const res = await raw(p.port, 'HEAD', '/x/plans', {origin: null});
  expect(res.status).toBe(200);
  expect(res.body).toBe('');
  expect(res.head.toLowerCase()).toContain('content-type: application/json');
});
