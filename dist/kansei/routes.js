import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, link, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFms } from "../fms/fms.js";
import { controllersAt, parseAtc } from "../xplane/atc.js";
import { airportsNear, indexAptFiles, readAirport } from "./apt.js";
import { findAptFiles, findAtcFile, findDataFile, hasCifp, readCifpFrom } from "./files.js";
import { indexFixes } from "./fixes.js";
import { msaFor } from "./msa.js";
import { airportProcedures } from "./procedures.js";
export * from "./files.js";
export { indexAptFiles } from "./apt.js";
export { indexFixes } from "./fixes.js";
export { parseAtc } from "../xplane/atc.js";
const DEFAULT_NM = 30;
const MAX_NM = 100;
const MAX_RESULTS = 20;
const DEFAULT_FS_OPS = {
    rename,
    link,
    copyFile,
    rm: (path) => rm(path, { force: true }),
    pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
/** A replace that fails with one of these is retried: on Windows another program (X-Plane, a scanner) may hold the file for a moment. */
const RETRY_CODES = ['EPERM', 'EACCES', 'EBUSY'];
const RENAME_RETRIES = 5;
const RETRY_PAUSE_MS = 100;
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const errorCode = (e) => e.code;
export const PLAN_LIMIT_BYTES = 262144;
const PLANS_PATH = '/plans';
const UPLINK_NAME = 'b738x.xml';
/** The plan names a PUT accepts, decided on the raw path: only these characters, so nothing else can reach the file system. */
const FMS_NAME = /^([A-Za-z0-9_-]{1,32})\.fms$/;
/** Windows opens these as devices whatever the extension, so they are never plan names. */
const DEVICE_NAME = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i;
/** A query value as a number, or NaN when it is missing, empty or not a number. */
function numberParam(params, name) {
    const raw = params.get(name);
    if (raw === null || raw.trim() === '')
        return NaN;
    return Number(raw);
}
function validPosition(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}
function sendJson(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
}
/** True when the name is one a PUT may write: `<name>.fms` or exactly `b738x.xml`. */
function validPlanName(name) {
    if (name === UPLINK_NAME)
        return true;
    const match = FMS_NAME.exec(name);
    return match !== null && !DEVICE_NAME.test(match[1] ?? '');
}
/** The shape check for an uplink file: there is no XML parser in Node's standard library, so this is the bar. */
function looksLikeUplink(bytes) {
    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    }
    catch {
        return false;
    }
    text = text.replace(/^﻿/, '').trim();
    return (text.startsWith('<?xml') || text.startsWith('<OFP')) && /<OFP[\s>]/.test(text) && text.endsWith('</OFP>') && !text.includes('\0');
}
/** The body of a request; 'too-large' as soon as it passes the limit (reading stops), 'aborted' when the client goes away first. */
function readBody(req, limit) {
    return new Promise((resolve) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                chunks.length = 0;
                req.removeAllListeners('data');
                resolve('too-large');
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', () => resolve('aborted'));
        req.on('close', () => {
            if (!req.complete)
                resolve('aborted');
        });
    });
}
/** The upper-cased airport id after a route prefix, or null when it cannot be decoded. */
function idFrom(pathname, prefix) {
    try {
        return decodeURIComponent(pathname.slice(prefix.length)).toUpperCase();
    }
    catch {
        return null;
    }
}
/**
 * True for the lookup routes (the ones that need the index), false for plans and anything else.
 * @internal For tests and hosts' tests; may change.
 */
export function isDataPath(pathname) {
    return (pathname === '/status' || pathname === '/airports/near' || pathname === '/controllers' ||
        pathname.startsWith('/airport/') || pathname.startsWith('/procedures/') || pathname.startsWith('/msa/'));
}
export function createKanseiRoutesFromData(data, opts = {}) {
    const { index, controllers } = data;
    const byId = new Map();
    for (const entry of index)
        if (!byId.has(entry.id))
            byId.set(entry.id, entry);
    const noFixes = { find: () => null };
    const procCache = new Map();
    function proceduresOf(id) {
        let cached = procCache.get(id);
        if (!cached) {
            const fixes = data.fixes ?? noFixes;
            const at = byId.get(id);
            cached = (data.readCifp?.(id) ?? Promise.resolve(null)).then((text) => (text === null ? null : airportProcedures(id, text, fixes, at && { lat: at.lat, lon: at.lon })));
            procCache.set(id, cached);
            cached.catch(() => procCache.delete(id));
        }
        return cached;
    }
    const msaCache = new Map();
    /** The lookup routes; `pathname` is one of theirs (the caller checked) and `query` the raw query without its `?`. */
    function answerData(pathname, query, res) {
        const params = new URLSearchParams(query);
        if (pathname === '/status') {
            sendJson(res, 200, { ok: true, airports: index.length, controllers: controllers.length });
        }
        else if (pathname === '/airports/near') {
            const lat = numberParam(params, 'lat');
            const lon = numberParam(params, 'lon');
            if (!validPosition(lat, lon))
                return sendJson(res, 400, { error: 'Bad position' });
            const nmValue = numberParam(params, 'nm');
            const nm = Number.isFinite(nmValue) ? Math.min(Math.max(nmValue, 0), MAX_NM) : DEFAULT_NM;
            sendJson(res, 200, airportsNear(index, lat, lon, nm, MAX_RESULTS));
        }
        else if (pathname.startsWith('/airport/')) {
            const id = idFrom(pathname, '/airport/');
            const entry = id === null ? undefined : byId.get(id);
            if (!entry)
                return sendJson(res, 404, { error: 'No such airport' });
            readAirport(entry).then((airport) => (airport ? sendJson(res, 200, airport) : sendJson(res, 404, { error: 'No such airport' })), () => sendJson(res, 500, { error: 'Cannot read airport' }));
        }
        else if (pathname.startsWith('/procedures/')) {
            const id = idFrom(pathname, '/procedures/');
            if (id === null || !byId.has(id))
                return sendJson(res, 404, { error: 'No procedures' });
            proceduresOf(id).then((procs) => (procs ? sendJson(res, 200, procs) : sendJson(res, 404, { error: 'No procedures' })), () => sendJson(res, 500, { error: 'Cannot read procedures' }));
        }
        else if (pathname.startsWith('/msa/')) {
            const id = idFrom(pathname, '/msa/');
            const entry = id === null ? undefined : byId.get(id);
            if (id === null || !entry || !data.msaText)
                return sendJson(res, 200, []);
            const cached = msaCache.get(id);
            if (cached)
                return sendJson(res, 200, cached);
            const text = data.msaText;
            proceduresOf(id).catch(() => null).then((procs) => {
                const found = msaFor(id, text, data.fixes ?? noFixes, { lat: entry.lat, lon: entry.lon }, procs?.runways ?? []);
                msaCache.set(id, found);
                sendJson(res, 200, found);
            });
        }
        else if (pathname === '/controllers') {
            const lat = numberParam(params, 'lat');
            const lon = numberParam(params, 'lon');
            const altFt = numberParam(params, 'altFt');
            if (!validPosition(lat, lon) || !Number.isFinite(altFt))
                return sendJson(res, 400, { error: 'Bad position' });
            sendJson(res, 200, controllersAt(controllers, lat, lon, altFt));
        }
        else {
            sendJson(res, 404, { error: 'Not found' });
        }
    }
    const { plansDir } = opts;
    const fs = { ...DEFAULT_FS_OPS, ...opts.fsOps };
    function reportPlanError(e) {
        opts.onPlanError?.(e instanceof Error ? e : new Error(String(e)));
    }
    /** Answers a plan request; a refusal closes the connection so an unread body is not kept waiting for. */
    function planReply(res, status, body) {
        if (status >= 400)
            res.setHeader('connection', 'close');
        sendJson(res, status, body);
        if (status >= 400)
            res.on('finish', () => res.req.destroy());
    }
    async function listPlans(dir) {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        }
        catch (e) {
            if (errorCode(e) === 'ENOENT')
                return [];
            throw e;
        }
        return entries.filter((e) => e.isFile() && validPlanName(e.name)).map((e) => e.name).sort();
    }
    async function replaceFile(temp, target) {
        for (let attempt = 0;; attempt++) {
            try {
                return await fs.rename(temp, target);
            }
            catch (e) {
                if (attempt >= RENAME_RETRIES || !RETRY_CODES.includes(errorCode(e) ?? ''))
                    throw e;
                await fs.pause(RETRY_PAUSE_MS);
            }
        }
    }
    /** A hard link, or an exclusive copy where hard links are unsupported (FAT32, exFAT). False when the name is taken. */
    async function putInPlaceExclusively(temp, target) {
        try {
            await fs.link(temp, target);
            return true;
        }
        catch (e) {
            if (errorCode(e) === 'EEXIST')
                return false;
        }
        try {
            await fs.copyFile(temp, target, constants.COPYFILE_EXCL);
            return true;
        }
        catch (e) {
            if (errorCode(e) === 'EEXIST')
                return false;
            throw e;
        }
    }
    /** Puts the bytes in place under the checked name without X-Plane ever seeing half a file. Resolves to whether it replaced one. */
    async function savePlan(dir, name, bytes, overwrite) {
        const target = join(dir, name);
        const existed = await lstat(target).then(() => true, (e) => {
            if (e.code === 'ENOENT')
                return false;
            throw e;
        });
        if (existed && !overwrite)
            return 'exists';
        await mkdir(dir, { recursive: true });
        const temp = join(dir, `.kansei-${randomUUID()}.tmp`);
        try {
            await writeFile(temp, bytes, { flag: 'wx' });
            if (overwrite) {
                await replaceFile(temp, target);
            }
            else if (!(await putInPlaceExclusively(temp, target))) {
                return 'exists';
            }
        }
        finally {
            // The plan is already saved or the save already failed; a temp file that cannot be removed is only reported.
            await fs.rm(temp).catch(reportPlanError);
        }
        return existed ? 'replaced' : 'created';
    }
    async function putPlan(req, res, dir, name, query) {
        if (!validPlanName(name))
            return planReply(res, 400, { error: 'Bad plan name' });
        if (query !== null && query !== 'overwrite=1')
            return planReply(res, 400, { error: 'Bad query' });
        const length = req.headers['content-length'];
        if (length !== undefined && Number(length) > PLAN_LIMIT_BYTES)
            return planReply(res, 413, { error: 'Plan too large' });
        const body = await readBody(req, PLAN_LIMIT_BYTES);
        if (body === 'aborted')
            return;
        if (body === 'too-large')
            return planReply(res, 413, { error: 'Plan too large' });
        // X-Plane's reader may not skip a byte-order mark, so one is not written.
        const bytes = body.subarray(0, BOM.length).equals(BOM) ? body.subarray(BOM.length) : body;
        if (name === UPLINK_NAME) {
            if (!looksLikeUplink(bytes))
                return planReply(res, 400, { error: 'Not an uplink file' });
        }
        else {
            let text;
            try {
                text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            }
            catch {
                return planReply(res, 400, { error: 'Not a flight plan: the file is not UTF-8 text' });
            }
            const plan = parseFms(text);
            if ('error' in plan)
                return planReply(res, 400, { error: `Not a flight plan: ${plan.error}` });
        }
        try {
            const result = await savePlan(dir, name, bytes, query !== null);
            if (result === 'exists')
                return planReply(res, 409, { error: 'exists' });
            sendJson(res, result === 'created' ? 201 : 200, { saved: name });
        }
        catch (e) {
            reportPlanError(e);
            planReply(res, 500, { error: 'Could not save the plan' });
        }
    }
    function methodNotAllowed(res, allow) {
        res.setHeader('allow', allow);
        planReply(res, 405, { error: 'Method not allowed' });
    }
    /** The plan routes, called with the raw request target (no decoding, no normalising). */
    function answerPlans(req, res, target) {
        if (plansDir === undefined)
            return planReply(res, 403, { error: 'Plan saving is off' });
        const cut = target.indexOf('?');
        const path = cut < 0 ? target : target.slice(0, cut);
        const query = cut < 0 ? null : target.slice(cut + 1);
        const method = req.method;
        if (path === PLANS_PATH) {
            if (method !== 'GET' && method !== 'HEAD')
                return methodNotAllowed(res, 'GET, HEAD, OPTIONS');
            listPlans(plansDir).then((plans) => sendJson(res, 200, { plans }), (e) => {
                reportPlanError(e);
                sendJson(res, 500, { error: 'Could not list the plans' });
            });
            return;
        }
        if (method !== 'PUT')
            return methodNotAllowed(res, 'PUT, OPTIONS');
        if (req.headers.origin === undefined)
            return planReply(res, 403, { error: 'Origin required' });
        putPlan(req, res, plansDir, path.slice(PLANS_PATH.length + 1), query).catch((e) => {
            reportPlanError(e);
            if (!res.headersSent)
                planReply(res, 500, { error: 'Could not save the plan' });
        });
    }
    function handle(req, res, target) {
        const cut = target.indexOf('?');
        const pathname = cut < 0 ? target : target.slice(0, cut);
        if (pathname === PLANS_PATH || pathname.startsWith(`${PLANS_PATH}/`)) {
            answerPlans(req, res, target);
            return true;
        }
        if (!isDataPath(pathname))
            return false;
        if (req.method !== 'GET') {
            sendJson(res, 404, { error: 'Not found' });
            return true;
        }
        answerData(pathname, cut < 0 ? '' : target.slice(cut + 1), res);
        return true;
    }
    return { handle };
}
async function readOptional(file) {
    return file === null ? null : readFile(file, 'utf8');
}
/** Routes over an X-Plane folder. The index is built in the background from the constructor on; plans answer at once. */
export function createKanseiRoutes(opts) {
    const { xplaneRoot, deps, ...routeOpts } = opts;
    // Plans need no index, so they are always answered by an instance with no data.
    const plansOnly = createKanseiRoutesFromData({ index: [], controllers: [] }, routeOpts);
    let inner = null;
    let current = null;
    let failed = false;
    let closed = false;
    async function build() {
        const index = await (deps?.indexAptFiles ?? indexAptFiles)(findAptFiles(xplaneRoot));
        const atcFile = findAtcFile(xplaneRoot);
        const controllers = atcFile === null ? [] : parseAtc(await readFile(atcFile, 'utf8'));
        const [fixText, navText, msaText] = await Promise.all([
            readOptional(findDataFile(xplaneRoot, 'earth_fix.dat')),
            readOptional(findDataFile(xplaneRoot, 'earth_nav.dat')),
            readOptional(findDataFile(xplaneRoot, 'earth_msa.dat')),
        ]);
        const data = { index, controllers, readCifp: readCifpFrom(xplaneRoot), fixes: indexFixes(fixText ?? '', navText ?? ''), msaText };
        if (closed)
            throw new Error('closed');
        inner = createKanseiRoutesFromData(data, routeOpts);
        current = {
            ok: true,
            airports: index.length,
            controllers: controllers.length,
            ready: true,
            root: xplaneRoot,
            cifp: hasCifp(xplaneRoot),
            atc: atcFile !== null,
            msa: msaText !== null,
        };
    }
    const ready = build().catch((e) => {
        if (closed)
            throw new Error('closed');
        failed = true;
        throw e;
    });
    ready.catch(() => undefined);
    /** The status code for an error answer: 500 after a failure, 503 while building and after close. */
    const errorStatus = () => (failed && !closed ? 500 : 503);
    function status() {
        if (current)
            return { ...current };
        return { error: failed && !closed ? 'index failed' : 'indexing' };
    }
    function handle(req, res, target) {
        const cut = target.indexOf('?');
        const pathname = cut < 0 ? target : target.slice(0, cut);
        if (!isDataPath(pathname))
            return plansOnly.handle(req, res, target);
        if (req.method !== 'GET') {
            sendJson(res, 404, { error: 'Not found' });
            return true;
        }
        if (pathname === '/status') {
            const answer = status();
            sendJson(res, 'error' in answer ? errorStatus() : 200, answer);
            return true;
        }
        if (inner)
            return inner.handle(req, res, target);
        sendJson(res, errorStatus(), status());
        return true;
    }
    return {
        handle,
        ready,
        status,
        close() {
            closed = true;
            inner = null;
            current = null;
        },
    };
}
