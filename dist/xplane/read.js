// Read-only client for X-Plane 12's built-in web API (REST + WebSocket).
// Opt-in: nothing here touches the network until createSimReader(...).connect() is called.
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const DEFAULT_TIMEOUT_MS = 8000;
const SUBSCRIBE_REQ_ID = 1;
class TimeoutError extends Error {
}
/** 'https://host:1/x/' -> {httpBase: 'https://host:1/x', wsBase: 'wss://host:1/x'}; http -> ws. */
export function simBaseFromUrl(url) {
    const httpBase = url.replace(/\/+$/, '');
    return { httpBase, wsBase: httpBase.replace(/^http/i, 'ws') };
}
/**
 * The text of a data dataref such as sim/aircraft/view/acf_ICAO. X-Plane's web API sends those as base64 of a
 * fixed-size byte buffer padded with NUL bytes. Returns the text up to the first NUL, decoded as UTF-8, or null
 * when the value is not a string or is not valid base64.
 */
export function decodeText(value) {
    if (typeof value !== 'string')
        return null;
    let binary;
    try {
        binary = atob(value);
    }
    catch {
        return null;
    }
    const nul = binary.indexOf('\0');
    if (nul >= 0)
        binary = binary.slice(0, nul);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}
const isValue = (v) => (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string' || (Array.isArray(v) && v.every((n) => typeof n === 'number'));
export function createSimReader(opts) {
    const valueCbs = new Set();
    const stateCbs = new Set();
    const keys = Object.keys(opts.datarefs);
    const required = opts.required ?? [];
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let state = 'off';
    let run = 0; // bumped on every connect/disconnect so stale async work is ignored
    let socket = null;
    let timer = null;
    let openTimer = null;
    let attempt = 0;
    let readIds = new Map(); // ids looked up by read(), for the current connection only
    const inFlight = new Set();
    // A throwing callback must not break the reader or the callbacks after it.
    const callSafely = (cb, ...args) => {
        try {
            cb(...args);
        }
        catch (e) {
            console.error('kyouyou/xplane/read: a callback threw', e);
        }
    };
    const setState = (s) => {
        if (state === s)
            return;
        state = s;
        for (const cb of [...stateCbs])
            callSafely(cb, s);
    };
    /** GET and parse JSON. Gives up after `timeoutMs` even when `fetch` ignores its signal; disconnect() aborts it. */
    const getJson = (url) => {
        const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
        const ctl = new AbortController();
        inFlight.add(ctl);
        return new Promise((resolve, reject) => {
            // Every way out goes through here, so nothing outlives the request.
            const cleanup = () => {
                clearTimeout(t);
                inFlight.delete(ctl);
            };
            const t = setTimeout(() => {
                cleanup();
                reject(new TimeoutError(`request timed out: ${url}`));
                ctl.abort();
            }, timeoutMs);
            ctl.signal.addEventListener('abort', () => {
                cleanup();
                reject(new Error(`request aborted: ${url}`));
            });
            let pending;
            try {
                pending = doFetch(url, { signal: ctl.signal });
            }
            catch (e) {
                cleanup();
                reject(e);
                return;
            }
            pending
                .then(async (res) => {
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}: ${url}`);
                return res.json();
            })
                .then((v) => {
                cleanup();
                resolve(v);
            }, (e) => {
                cleanup();
                reject(e);
            });
        });
    };
    /** Id of the named dataref, or undefined when X-Plane says it has none. */
    const lookupId = async (name) => {
        const body = await getJson(`${opts.base.httpBase}/api/v3/datarefs?filter[name]=${encodeURIComponent(name)}`);
        const first = body?.data?.[0];
        return typeof first?.id === 'number' ? first.id : undefined;
    };
    // Runs at most once per socket: an error is usually followed by a close, and a stale socket must not reschedule.
    const fail = (id, ws, next = 'unavailable') => {
        if (id !== run)
            return;
        if (ws) {
            if (socket !== ws)
                return;
            ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
            try {
                ws.close();
            }
            catch {
                // already closed
            }
        }
        socket = null;
        if (openTimer)
            clearTimeout(openTimer);
        openTimer = null;
        setState(next);
        const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
        attempt++;
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            if (id === run)
                start();
        }, delay);
    };
    const start = () => {
        const id = run;
        readIds = new Map();
        setState('connecting');
        void open(id).catch(() => fail(id));
    };
    const open = async (id) => {
        const WS = opts.WebSocket ?? globalThis.WebSocket;
        const caps = (await getJson(`${opts.base.httpBase}/api/capabilities`));
        if (id !== run)
            return;
        const versions = Array.isArray(caps.api?.versions) ? caps.api.versions.map((v) => String(v).replace(/^v/i, '')) : [];
        if (!versions.includes('3'))
            throw new Error('X-Plane web API v3 is not available');
        // X-Plane answers with no datarefs at all while no flight is loaded.
        const count = (await getJson(`${opts.base.httpBase}/api/v3/datarefs/count`))?.data;
        if (id !== run)
            return;
        if (typeof count !== 'number' || !Number.isFinite(count))
            throw new Error('unexpected dataref count answer');
        if (count === 0) {
            fail(id, undefined, 'no-flight');
            return;
        }
        // Session ids, looked up afresh on every attempt. Two keys may name the same dataref.
        const keysById = new Map();
        for (const key of keys) {
            let found;
            try {
                found = await lookupId(opts.datarefs[key]);
            }
            catch (e) {
                // A timeout means X-Plane is not answering, so it fails the attempt whether or not the key is required.
                if (e instanceof TimeoutError || required.includes(key))
                    throw e;
            }
            if (id !== run)
                return;
            if (typeof found === 'number')
                keysById.set(String(found), [...(keysById.get(String(found)) ?? []), key]);
            else if (required.includes(key))
                throw new Error(`dataref not found: ${opts.datarefs[key]}`);
        }
        const ws = new WS(`${opts.base.wsBase}/api/v3`);
        socket = ws;
        openTimer = setTimeout(() => {
            openTimer = null;
            fail(id, ws);
        }, timeoutMs);
        const merged = {}; // X-Plane sends only changed values, so keep the latest of each
        ws.onopen = () => {
            if (id !== run)
                return;
            if (openTimer)
                clearTimeout(openTimer);
            openTimer = null;
            ws.send(JSON.stringify({ req_id: SUBSCRIBE_REQ_ID, type: 'dataref_subscribe_values', params: { datarefs: [...keysById.keys()].map((n) => ({ id: Number(n) })) } }));
        };
        ws.onmessage = (e) => {
            if (id !== run)
                return;
            let msg;
            try {
                msg = JSON.parse(String(e.data));
            }
            catch {
                return;
            }
            if (typeof msg !== 'object' || msg === null)
                return;
            const { type, data, req_id, success } = msg;
            if (type === 'result') {
                if (req_id === SUBSCRIBE_REQ_ID && success === false)
                    fail(id, ws);
                return;
            }
            if (type !== 'dataref_update_values' || typeof data !== 'object' || data === null)
                return;
            let changed = false;
            for (const [n, value] of Object.entries(data)) {
                if (!isValue(value))
                    continue;
                for (const key of keysById.get(n) ?? []) {
                    merged[key] = value;
                    changed = true;
                }
            }
            if (!changed)
                return;
            if (required.every((key) => key in merged)) {
                attempt = 0; // the backoff resets only once a connection has proved itself, not when the socket opens
                setState('connected');
            }
            const snapshot = { ...merged };
            const at = (opts.now ?? Date.now)();
            for (const cb of [...valueCbs])
                callSafely(cb, snapshot, at);
        };
        ws.onerror = () => fail(id, ws);
        ws.onclose = () => fail(id, ws);
    };
    const readOne = async (name, ids) => {
        // Ids are session ids: once a new attempt (or a disconnect) has replaced the map, stop without another request.
        const current = () => {
            if (ids !== readIds)
                throw new Error('the reader reconnected or disconnected during read');
        };
        current();
        let id = ids.get(name);
        if (id === undefined) {
            id = await lookupId(name);
            current();
            if (id === undefined)
                return undefined;
            ids.set(name, id);
        }
        const body = (await getJson(`${opts.base.httpBase}/api/v3/datarefs/${id}/value`));
        current();
        return isValue(body?.data) ? body.data : undefined;
    };
    return {
        get state() {
            return state;
        },
        connect() {
            if (state !== 'off')
                return;
            run++;
            attempt = 0;
            start();
        },
        disconnect() {
            run++;
            if (timer)
                clearTimeout(timer);
            timer = null;
            if (openTimer)
                clearTimeout(openTimer);
            openTimer = null;
            readIds = new Map(); // a read still going must not continue
            for (const ctl of [...inFlight])
                ctl.abort();
            inFlight.clear();
            const s = socket;
            socket = null;
            if (s) {
                s.onopen = s.onmessage = s.onerror = s.onclose = null;
                s.close();
            }
            setState('off');
        },
        onValues(cb) {
            valueCbs.add(cb);
            return () => valueCbs.delete(cb);
        },
        onState(cb) {
            stateCbs.add(cb);
            return () => stateCbs.delete(cb);
        },
        async read(names) {
            if (state !== 'connected')
                throw new Error(`X-Plane is not connected (state: ${state})`);
            const ids = readIds;
            const values = await Promise.all(names.map((name) => readOne(name, ids)));
            const out = {};
            names.forEach((name, i) => {
                const v = values[i];
                if (v !== undefined)
                    out[name] = v;
            });
            return out;
        },
    };
}
