/**
 * A stand-in Kuukou server for apps' tests: answers `/kuukou/api/server`, folder manifests and folder
 * files (with HTTP Range) from in-memory made-up files, as the real server's contract says (kuukou repo,
 * docs/contracts.md, "Kuukou server"). Test-only. The sim relay and write lock are not stood in yet.
 */
import { createServer } from 'node:http';
const enc = new TextEncoder();
const bytes = (v) => (typeof v === 'string' ? enc.encode(v) : v);
/** A copy as a plain ArrayBuffer, which every Response body type accepts. */
const buf = (u) => u.slice().buffer;
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
        const rest = decodeURIComponent(m[2]);
        if (rest === '' && url.searchParams.has('manifest')) {
            return json(Object.entries(folder).map(([path, v]) => ({ path, size: bytes(v).length })).sort((a, b) => a.path.localeCompare(b.path)));
        }
        const key = Object.keys(folder).find((k) => k.toLowerCase() === rest.toLowerCase());
        if (key === undefined || rest.split('/').includes('..'))
            return new Response('not found', { status: 404 });
        const body = bytes(folder[key]);
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get('range') ?? '');
        if (range) {
            const start = Number(range[1]), end = range[2] === '' ? body.length - 1 : Math.min(Number(range[2]), body.length - 1);
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
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers))
            if (typeof v === 'string')
                headers.set(k, v);
        const r = await handle(new Request(`http://127.0.0.1${req.url ?? '/'}`, { method: req.method, headers }));
        res.writeHead(r.status, Object.fromEntries(r.headers));
        res.end(Buffer.from(await r.arrayBuffer()));
    });
    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
    const { port: p } = server.address();
    return { url: `http://127.0.0.1:${p}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
