// Read-only client for X-Plane 12's built-in web API (REST + WebSocket).
// Opt-in: nothing here touches the network until createSimReader(...).connect() is called.
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
/** 'https://host:1/x/' -> {httpBase: 'https://host:1/x', wsBase: 'wss://host:1/x'}; http -> ws. */
export function simBaseFromUrl(url) {
    const httpBase = url.replace(/\/+$/, '');
    return { httpBase, wsBase: httpBase.replace(/^http/i, 'ws') };
}
const isValue = (v) => (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string' || (Array.isArray(v) && v.every((n) => typeof n === 'number'));
export function createSimReader(opts) {
    const valueCbs = new Set();
    const stateCbs = new Set();
    const keys = Object.keys(opts.datarefs);
    let state = 'off';
    let run = 0; // bumped on every connect/disconnect so stale async work is ignored
    let socket = null;
    let timer = null;
    let attempt = 0;
    const setState = (s) => {
        if (state === s)
            return;
        state = s;
        for (const cb of stateCbs)
            cb(s);
    };
    // Runs at most once per socket: an error is usually followed by a close, and a stale socket must not reschedule.
    const fail = (id, ws) => {
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
        setState('unavailable');
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
        setState('connecting');
        void open(id).catch(() => fail(id));
    };
    const open = async (id) => {
        const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
        const WS = opts.WebSocket ?? globalThis.WebSocket;
        const caps = (await (await doFetch(`${opts.base.httpBase}/api/capabilities`)).json());
        if (id !== run)
            return;
        const versions = Array.isArray(caps.api?.versions) ? caps.api.versions.map((v) => String(v).replace(/^v/i, '')) : [];
        if (!versions.includes('3'))
            throw new Error('X-Plane web API v3 is not available');
        // Session ids, looked up afresh on every attempt. Two keys may name the same dataref.
        const keysById = new Map();
        for (const key of keys) {
            let found;
            try {
                const res = await doFetch(`${opts.base.httpBase}/api/v3/datarefs?filter[name]=${encodeURIComponent(opts.datarefs[key])}`);
                found = (await res.json()).data?.[0]?.id;
            }
            catch (e) {
                if (opts.required.includes(key))
                    throw e;
            }
            if (id !== run)
                return;
            if (typeof found === 'number')
                keysById.set(String(found), [...(keysById.get(String(found)) ?? []), key]);
            else if (opts.required.includes(key))
                throw new Error(`dataref not found: ${opts.datarefs[key]}`);
        }
        const ws = new WS(`${opts.base.wsBase}/api/v3`);
        socket = ws;
        const merged = {}; // X-Plane sends only changed values, so keep the latest of each
        ws.onopen = () => {
            if (id !== run)
                return;
            attempt = 0;
            ws.send(JSON.stringify({ req_id: 1, type: 'dataref_subscribe_values', params: { datarefs: [...keysById.keys()].map((n) => ({ id: Number(n) })) } }));
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
            const { type, data } = msg;
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
            if (opts.required.every((key) => key in merged))
                setState('connected');
            const snapshot = { ...merged };
            const at = (opts.now ?? Date.now)();
            for (const cb of valueCbs)
                cb(snapshot, at);
        };
        ws.onerror = () => fail(id, ws);
        ws.onclose = () => fail(id, ws);
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
    };
}
