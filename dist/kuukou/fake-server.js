/**
 * A stand-in Kuukou server for apps' tests: answers `/kuukou/api/server`, folder manifests and folder
 * files (with HTTP Range) from in-memory made-up files, as the real server's contract says (kuukou repo,
 * docs/contracts.md, "Kuukou server"). Test-only. Like the real server it serves only allow-listed
 * names (case-insensitive) and honours Range only on .bin, .J3N and .J3G; it does not check where in
 * the Jeppesen folder a file sits (the real server also checks the chart and cycle directories), nor
 * gzip, caching headers, client addresses or pairing. The sim relay and write lock are not stood in yet.
 */
import { createServer } from 'node:http';
const enc = new TextEncoder();
const bytes = (v) => (typeof v === 'string' ? enc.encode(v) : v);
/** A copy as a plain ArrayBuffer, which every Response body type accepts. */
const buf = (u) => u.slice().buffer;
const XPLANE_ALLOWED = /^(earth_(nav|fix|awy|hold|msa|mora|aptmeta)\.dat|airspaces\/airspace\.txt|1200 atc data\/earth nav data\/atc\.dat|cycle\.json|cycle_info\.txt|cifp\/[^/]+\.dat)$/i;
const JEPPESEN_DIRS = new Set(['common', 'terminalcharts', 'fonts', 'c2e4', 'data1', 'data2', 'j3n', 'j3n4']);
const JEPPESEN_FILES = new Set([
    'charts.bin', 'charts.dbf', 'ctypes.dbf', 'airports.dbf', 'jeppesen.tfl', 'jeppesen.tls', 'lssdef.tcl',
    'notams.dbf', 'notams.dbt', 'vfrntms.dbf', 'vfrntms.dbt', 'country.dbf', 'vfrcharts.bin', 'vfrchrts.dbf',
    'vfrapts.dbf', 'j3n.xml',
    ...['airport', 'runway', 'airportcomm', 'ils', 'lowuseapt', 'vhfnavaid', 'ndbterm', 'ndbenrt', 'waypointterm',
        'waypointenrt', 'airwayseglo', 'airwayseghi', 'gridmora', 'holdpat', 'sidpathterm', 'starpathterm'].map((n) => `${n}.j3n`),
    ...['ctrlarsp', 'suarsp', 'fironly'].flatMap((n) => [`${n}.j3n`, `${n}.j3g`]),
]);
/** Whether the real server would serve this path from that folder (names only, case-insensitive). */
function allowed(kind, path) {
    if (kind === 'xplane')
        return XPLANE_ALLOWED.test(path);
    const parts = path.toLowerCase().split('/');
    const name = parts.pop();
    if (!parts.every((d) => JEPPESEN_DIRS.has(d)))
        return false;
    return JEPPESEN_FILES.has(name) || /^obstacle.*\.j3n$/.test(name) || /\.(jtf|ttf)$/.test(name);
}
/** Files the real server reads at offsets and serves with Range; everything else is read whole. */
const RANGED = /\.(bin|j3n|j3g)$/i;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
/** A fetch-shaped handler: pass it where an app's code takes a fetch, or use startFakeKuukou for HTTP. */
export function fakeKuukouHandler(folders) {
    return async (req) => {
        const url = new URL(req.url);
        if (url.pathname === '/kuukou/api/server') {
            return json({
                server: 'kuukou', version: 'fake',
                folders: { xplane: { ok: folders.xplane !== undefined, cycle: null }, jeppesen: { ok: folders.jeppesen !== undefined } },
                sim: { reachable: false, writer: null },
            });
        }
        const m = /^\/kuukou\/api\/files\/(xplane|jeppesen)\/(.*)$/.exec(url.pathname);
        const folder = m ? folders[m[1]] : undefined;
        if (!m || folder === undefined)
            return new Response('not found', { status: 404 });
        const kind = m[1];
        let rest;
        try {
            rest = decodeURIComponent(m[2]);
        }
        catch {
            return new Response('not found', { status: 404 });
        }
        if (rest === '' && url.searchParams.has('manifest')) {
            const list = Object.entries(folder).filter(([path]) => allowed(kind, path)).map(([path, v]) => ({ path, size: bytes(v).length }));
            return json(list.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)));
        }
        const key = Object.keys(folder).find((k) => k.toLowerCase() === rest.toLowerCase());
        if (key === undefined || rest.split('/').includes('..') || !allowed(kind, key))
            return new Response('not found', { status: 404 });
        const body = bytes(folder[key]);
        const spec = RANGED.test(key) ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '') : null;
        const range = spec && (spec[1] !== '' || spec[2] !== '') ? spec : null;
        if (range) {
            // bytes=a-b, bytes=a- (to the end), bytes=-n (the last n bytes).
            const suffix = range[1] === '';
            const start = suffix ? Math.max(0, body.length - Number(range[2])) : Number(range[1]);
            const end = suffix || range[2] === '' ? body.length - 1 : Math.min(Number(range[2]), body.length - 1);
            if (start >= body.length || start > end)
                return new Response(null, { status: 416, headers: { 'content-range': `bytes */${body.length}` } });
            return new Response(buf(body.subarray(start, end + 1)), { status: 206, headers: { 'content-range': `bytes ${start}-${end}/${body.length}`, 'accept-ranges': 'bytes' } });
        }
        return new Response(buf(body), { headers: { 'accept-ranges': 'bytes', 'content-length': String(body.length) } });
    };
}
/** Starts the stand-in on 127.0.0.1 (a free port unless given), for end-to-end tests. */
export async function startFakeKuukou(folders, port = 0) {
    const handle = fakeKuukouHandler(folders);
    const server = createServer(async (req, res) => {
        try {
            const headers = new Headers();
            for (const [k, v] of Object.entries(req.headers))
                if (typeof v === 'string')
                    headers.set(k, v);
            const r = await handle(new Request(`http://127.0.0.1${req.url ?? '/'}`, { method: req.method, headers }));
            res.writeHead(r.status, Object.fromEntries(r.headers));
            res.end(Buffer.from(await r.arrayBuffer()));
        }
        catch {
            res.writeHead(500).end();
        }
    });
    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
    const { port: p } = server.address();
    return { url: `http://127.0.0.1:${p}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
