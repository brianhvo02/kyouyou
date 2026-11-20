// ARINC 424 rules shared by the CIFP readers (X-Plane's per-airport files and the FAA's FAACIFP18):
// a leg from its fields, grouping legs into procedures and routes, the missed approach, approach names,
// altitudes and packed positions. Both readers give the same `CifpAirport` shape because they share these.
export function makeLeg(f) {
    const d = f.descriptor.padEnd(4);
    return {
        seq: f.seq,
        fix: f.fix,
        region: f.region,
        pathTerm: f.pathTerm,
        alt: parseAlt(f.altDesc.trim(), f.alt1, f.alt2),
        speedKt: /^\d+$/.test(f.speed) ? Number(f.speed) : null,
        courseDeg: parseCourse(f.course),
        courseTrue: /^\d{3}T$/.test(f.course),
        descriptor: f.descriptor,
        role: roleOf(d[3] ?? ' '),
        flyOver: d[1] === 'Y',
        missed: false,
        turnDirection: /^[LRE]$/.test(f.turn) ? f.turn : null,
        recommendedNavaid: f.navaid === '' ? null : { ident: f.navaid, region: f.navaidRegion },
        arcRadiusNm: scaled(f.arcRadius, /^\d{6}$/, 1000),
        thetaDeg: scaled(f.theta, /^\d{4}$/, 10),
        rhoNm: scaled(f.rho, /^\d{4}$/, 10),
        routeDistanceNm: scaled(f.distance, /^\d{4}$/, 10),
        holdTimeMin: /^T\d{3}$/.test(f.distance) ? Number(f.distance.slice(1)) / 10 : null,
        verticalAngleDeg: scaled(f.verticalAngle, /^-?\d{3,4}$/, 100),
        // The same column carries other references on other legs (runways, procedure-turn markers).
        arcCentre: f.pathTerm !== 'RF' || f.centre === '' ? null : { ident: f.centre, region: f.centreRegion },
    };
}
/** A fixed-point number as written, or null when it doesn't match. */
function scaled(s, pattern, divisor) {
    return pattern.test(s) ? Number(s) / divisor : null;
}
export function procedureCollector() {
    const procs = new Map();
    return {
        add(kind, name, routeType, routeName, leg) {
            const key = `${kind}\u0000${name}`;
            let entry = procs.get(key);
            if (entry === undefined) {
                entry = { proc: { kind, name, routes: [] }, routes: new Map() };
                if (kind === 'approach')
                    Object.assign(entry.proc, approachInfo(name));
                procs.set(key, entry);
            }
            const routeKey = `${routeType}\u0000${routeName}`;
            let route = entry.routes.get(routeKey);
            if (route === undefined) {
                route = { name: routeName, routeType, legs: [] };
                entry.routes.set(routeKey, route);
                entry.proc.routes.push(route);
            }
            route.legs.push(leg);
        },
        finish() {
            const procedures = [];
            for (const { proc } of procs.values()) {
                for (const route of proc.routes) {
                    route.legs.sort((a, b) => a.seq - b.seq);
                    let missed = false;
                    for (const leg of route.legs) {
                        if (proc.kind === 'approach' && leg.descriptor.padEnd(4)[2] === 'M')
                            missed = true;
                        leg.missed = missed;
                    }
                }
                procedures.push(proc);
            }
            return procedures;
        },
    };
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
    // 'R06LY' and the dash form 'R18-Z' or 'D27-2': runway, then an optional variant (a digit only after a dash).
    const m = /^[A-Z](\d{2}[LRC]?)(?:-([A-Z0-9])|([A-Z]))?$/.exec(name);
    const info = { approachType: type };
    if (m !== null) {
        info.runway = m[1];
        const variant = m[2] ?? m[3];
        if (variant !== undefined)
            info.variant = variant;
    }
    return info;
}
/** Feet, or `FL240` (24,000). Anything else is null. */
export function parseFeet(s) {
    if (/^-?\d+$/.test(s))
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
        case 'G':
        case 'H':
        case 'I':
        case 'J': {
            if (first === null)
                return null;
            const alt = { kind: desc === 'G' || desc === 'I' ? 'at' : 'at-or-above', ft: first };
            if (second !== null) {
                if (desc === 'G' || desc === 'H')
                    alt.glideSlopeFt = second;
                else
                    alt.glideSlopeInterceptFt = second;
            }
            return alt;
        }
        case ' ':
        case '@':
        case 'X':
            return first === null ? null : { kind: 'at', ft: first };
        case '+':
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
/** Course field: magnetic `dddd` in tenths of a degree, or true `dddT` in whole degrees. */
function parseCourse(s) {
    if (/^\d+$/.test(s))
        return Number(s) / 10;
    if (/^\d{3}T$/.test(s))
        return Number(s.slice(0, 3));
    return null;
}
/** ARINC 424 packed latitude `N/S DD MM SS ss` (9 chars). */
export function parseLat(s) {
    if (!/^[NS]\d{8}$/.test(s))
        return undefined;
    const v = Number(s.slice(1, 3)) + Number(s.slice(3, 5)) / 60 + (Number(s.slice(5, 7)) + Number(s.slice(7, 9)) / 100) / 3600;
    return s[0] === 'S' ? -v : v;
}
/** ARINC 424 packed longitude `E/W DDD MM SS ss` (10 chars). */
export function parseLon(s) {
    if (!/^[EW]\d{9}$/.test(s))
        return undefined;
    const v = Number(s.slice(1, 4)) + Number(s.slice(4, 6)) / 60 + (Number(s.slice(6, 8)) + Number(s.slice(8, 10)) / 100) / 3600;
    return s[0] === 'W' ? -v : v;
}
/** Elevation in feet, optionally signed; anything else is null. */
export function parseElevation(s) {
    return /^-?\d+$/.test(s) ? Number(s) : null;
}
