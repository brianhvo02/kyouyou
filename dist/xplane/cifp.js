// Reader for X-Plane's per-airport procedure files (CIFP/$ICAO.dat, spec XP CIFP1101 / XP CIFP1250).
// Model-neutral: it keeps approaches, altitude limits, speed limits and path terminators, and leaves
// resolving fixes and choosing a data model to the caller.
//
// Each line is `ROWCODE:field,field,...;` with optional further `;` groups. Handled row codes are
// SID, STAR, APPCH (legs) and RWY. Anything else (PRDAT and so on) is ignored. An optional
// `I` / `<version> Version` header is skipped.
const ROW_KINDS = { SID: 'sid', STAR: 'star', APPCH: 'approach' };
/** Never throws. Rows it cannot read are skipped. */
export function parseCifp(text) {
    const runways = [];
    const skipped = [];
    const procs = new Map();
    let transitionAltitudeFt = null;
    const missedMarks = new Map();
    const lines = text.split(/\r?\n/);
    lines.forEach((raw, i) => {
        const lineNo = i + 1;
        const line = raw.trim();
        if (line === '')
            return;
        if (/^[IA]$/.test(line) || /^\d+\s+Version\b/.test(line))
            return;
        const colon = line.indexOf(':');
        if (colon < 0) {
            skipped.push({ line: lineNo, reason: 'no row code' });
            return;
        }
        const code = line.slice(0, colon);
        const groups = line.slice(colon + 1).split(';');
        const rawFields = (groups[0] ?? '').split(',');
        const f = rawFields.map((s) => s.trim());
        if (code === 'RWY') {
            const lat = parseLat(((groups[1] ?? '').split(',')[0] ?? '').trim());
            const lon = parseLon(((groups[1] ?? '').split(',')[1] ?? '').trim());
            const ident = (f[0] ?? '').replace(/^RW/, '');
            if (ident === '' || lat === undefined || lon === undefined) {
                skipped.push({ line: lineNo, reason: 'RWY row without a readable runway or threshold position' });
                return;
            }
            runways.push({ ident, lat, lon, elevationFt: /^-?\d+$/.test(f[3] ?? '') ? Number(f[3]) : null });
            return;
        }
        const kind = ROW_KINDS[code];
        if (kind === undefined)
            return;
        const seq = /^\d+$/.test(f[0] ?? '') ? Number(f[0]) : NaN;
        const name = f[2] ?? '';
        if (f.length < 12 || name === '' || !Number.isFinite(seq)) {
            skipped.push({ line: lineNo, reason: `malformed ${code} row` });
            return;
        }
        if (transitionAltitudeFt === null)
            transitionAltitudeFt = parseFeet(f[25] ?? '');
        // Not trimmed: the leading spaces of '  M ' are positions.
        const descriptor = rawFields[8] ?? '';
        const d = descriptor.padEnd(4);
        const course = /^\d+$/.test(f[20] ?? '') ? Number(f[20]) / 10 : null;
        const speed = /^\d+$/.test(f[27] ?? '') ? Number(f[27]) : null;
        const leg = {
            seq,
            fix: f[4] ?? '',
            region: f[5] ?? '',
            pathTerm: f[11] ?? '',
            alt: parseAlt(f[22] ?? '', f[23] ?? '', f[24] ?? ''),
            speedKt: speed,
            courseDeg: course,
            descriptor,
            role: roleOf(d[3] ?? ' '),
            flyOver: d[1] === 'Y',
            missed: false,
        };
        const key = `${kind}\u0000${name}`;
        let entry = procs.get(key);
        if (entry === undefined) {
            entry = { proc: { kind, name, routes: [] }, routes: new Map() };
            if (kind === 'approach')
                Object.assign(entry.proc, approachInfo(name));
            procs.set(key, entry);
        }
        const routeName = f[3] ?? '';
        const routeType = f[1] ?? '';
        const routeKey = `${routeType}\u0000${routeName}`;
        let route = entry.routes.get(routeKey);
        if (route === undefined) {
            route = { name: routeName, routeType, legs: [] };
            entry.routes.set(routeKey, route);
            entry.proc.routes.push(route);
        }
        route.legs.push(leg);
        // Kept until the route is sorted, below.
        missedMarks.set(leg, d[2] === 'M');
    });
    const procedures = [];
    for (const { proc } of procs.values()) {
        for (const route of proc.routes) {
            route.legs.sort((a, b) => a.seq - b.seq);
            let missed = false;
            for (const leg of route.legs) {
                if (proc.kind === 'approach' && missedMarks.get(leg) === true)
                    missed = true;
                leg.missed = missed;
            }
        }
        procedures.push(proc);
    }
    return { runways, procedures, transitionAltitudeFt, skipped };
}
function roleOf(c) {
    if (c === 'A' || c === 'C' || c === 'D')
        return 'IAF';
    if (c === 'B')
        return 'IF';
    if (c === 'F')
        return 'FAF';
    if (c === 'M')
        return 'MAP';
    return null;
}
function approachInfo(name) {
    const type = { I: 'ILS', L: 'LOC', R: 'RNAV', H: 'RNP' }[name[0]] ?? 'other';
    const m = /^[A-Z](\d{2}[LRC]?)([A-Z]?)$/.exec(name);
    const info = { approachType: type };
    if (m !== null) {
        info.runway = m[1];
        if (m[2] !== '')
            info.variant = m[2];
    }
    return info;
}
/** Feet, or `FL240` (24,000). Anything else is null. */
function parseFeet(s) {
    if (/^\d+$/.test(s))
        return Number(s);
    const fl = /^FL(\d+)$/.exec(s);
    return fl === null ? null : Number(fl[1]) * 100;
}
function parseAlt(desc, a1, a2) {
    const first = parseFeet(a1);
    const second = parseFeet(a2);
    if (desc === '')
        desc = ' ';
    switch (desc) {
        case ' ':
        case '@':
        case 'X':
        case 'G':
        case 'I':
            return first === null ? null : { kind: 'at', ft: first };
        case '+':
        case 'H':
        case 'J':
        case 'V':
            return first === null ? null : { kind: 'at-or-above', ft: first };
        case 'C':
            return second === null ? null : { kind: 'at-or-above', ft: second };
        case '-':
        case 'Y':
            return first === null ? null : { kind: 'at-or-below', ft: first };
        case 'B':
            if (first === null)
                return null;
            return second === null ? { kind: 'between', ft: first } : { kind: 'between', ft: first, lowerFt: second };
        default:
            return null;
    }
}
/** ARINC 424 packed latitude `N/S DD MM SS ss` (9 chars). */
function parseLat(s) {
    if (!/^[NS]\d{8}$/.test(s))
        return undefined;
    const v = Number(s.slice(1, 3)) + Number(s.slice(3, 5)) / 60 + (Number(s.slice(5, 7)) + Number(s.slice(7, 9)) / 100) / 3600;
    return s[0] === 'S' ? -v : v;
}
/** ARINC 424 packed longitude `E/W DDD MM SS ss` (10 chars). */
function parseLon(s) {
    if (!/^[EW]\d{9}$/.test(s))
        return undefined;
    const v = Number(s.slice(1, 4)) + Number(s.slice(4, 6)) / 60 + (Number(s.slice(6, 8)) + Number(s.slice(8, 10)) / 100) / 3600;
    return s[0] === 'W' ? -v : v;
}
