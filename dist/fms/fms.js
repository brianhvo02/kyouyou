// X-Plane's v1100 `.fms` flight plan: reading one, and writing one. Kouro writes them, Kōkūzu and
// Kansei read them, so both ends live here and a round-trip test holds them together.
const KINDS = { '1': 'airport', '2': 'ndb', '3': 'vor', '11': 'fix' };
const TYPE_CODE = { airport: 1, ndb: 2, vor: 3, fix: 11 };
/** A `.fms` file's text as a plan, or why it is not one. Never throws. */
export function parseFms(text) {
    try {
        return parse(text);
    }
    catch (e) {
        return { error: e instanceof Error ? e.message : 'Could not parse flight plan' };
    }
}
function parse(text) {
    const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l !== '');
    if (lines.length < 3 || lines[0] !== 'I' || !/^1100\s+Version$/i.test(lines[1] ?? '')) {
        return { error: 'Not an X-Plane .fms flight plan (v1100)' };
    }
    const head = {};
    let count = -1;
    let i = 2;
    for (; i < lines.length; i++) {
        // Header lines are a keyword and the rest of the line. Keywords this does not know are skipped.
        const line = lines[i] ?? '';
        const m = /^(\S+)\s+(.+)$/.exec(line);
        if (!m)
            return { error: `Malformed header line: ${line}` };
        const key = m[1] ?? '';
        const value = m[2] ?? '';
        if (key === 'NUMENR') {
            if (!/^\d+$/.test(value))
                return { error: 'Invalid NUMENR' };
            count = Number(value);
            i++;
            break;
        }
        head[key] = value;
    }
    if (count < 0)
        return { error: 'Missing NUMENR' };
    // ADEP and ADES come from the header and are deliberately not checked against the first and last point.
    const origin = head['ADEP'];
    const dest = head['ADES'];
    if (!origin || !dest)
        return { error: 'Missing ADEP or ADES' };
    const wp = lines.slice(i);
    if (wp.length !== count)
        return { error: `NUMENR says ${count} waypoints but found ${wp.length}` };
    if (count < 2)
        return { error: 'A flight plan needs at least an origin and a destination' };
    const points = [];
    for (const line of wp) {
        const f = line.split(/\s+/);
        if (f.length !== 6)
            return { error: `Malformed waypoint line: ${line}` };
        // A type code this does not know is rejected: the point could not be placed as one of the four kinds.
        const kind = KINDS[f[0] ?? ''];
        const altitudeFt = Number(f[3]);
        const lat = Number(f[4]);
        const lon = Number(f[5]);
        if (!kind || !Number.isFinite(altitudeFt) || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
            return { error: `Malformed waypoint line: ${line}` };
        }
        points.push({ ident: f[1] ?? '', kind, lat, lon, via: f[2] ?? '', altitudeFt });
    }
    const airports = [];
    for (const p of points)
        if (p.kind === 'airport' && !airports.includes(p.ident))
            airports.push(p.ident);
    // The RW prefix is taken off runways (RW28R is 28R).
    const departureRunway = head['DEPRWY']?.replace(/^RW/, '');
    const arrivalRunway = head['DESRWY']?.replace(/^RW/, '');
    const plan = { origin, dest, points, airports };
    if (head['CYCLE'] !== undefined)
        plan.cycle = head['CYCLE'];
    if (departureRunway)
        plan.departureRunway = departureRunway;
    if (arrivalRunway)
        plan.arrivalRunway = arrivalRunway;
    if (head['SID'])
        plan.sid = procedure(head['SID'], departureRunway, head['SIDTRANS']);
    if (head['STAR'])
        plan.star = procedure(head['STAR'], arrivalRunway, head['STARTRANS']);
    if (head['APP']) {
        plan.approach = { name: head['APP'] };
        if (head['APPTRANS'])
            plan.approach.transition = head['APPTRANS'];
    }
    const cruise = Math.max(0, ...points.map((p) => p.altitudeFt));
    if (cruise > 0)
        plan.cruiseAltitudeFt = cruise;
    return plan;
}
function procedure(name, runway, transition) {
    const p = { name };
    if (runway)
        p.runway = runway;
    if (transition)
        p.transition = transition;
    return p;
}
function withRw(runway) {
    const r = runway.trim().toUpperCase();
    return r.startsWith('RW') ? r : `RW${r}`;
}
function pointLine(p, via, altitudeFt) {
    return `${TYPE_CODE[p.kind]} ${p.ident} ${via} ${altitudeFt.toFixed(6)} ${p.lat.toFixed(6)} ${p.lon.toFixed(6)}`;
}
/** The plan as the text of an X-Plane 11/12 `.fms` file (v1100). Every line ends with a newline. */
export function writeFms(plan, mode) {
    const named = mode === 'named';
    const sidName = plan.sid?.name;
    const starName = plan.star?.name;
    const isProcedure = (via) => via === sidName || via === starName;
    const sidRunway = named ? plan.sid?.runway : undefined;
    const starRunway = named ? plan.star?.runway : undefined;
    const expandedBySim = (via) => (sidRunway !== undefined && via === sidName) || (starRunway !== undefined && via === starName);
    const header = ['I', '1100 Version', `CYCLE ${plan.cycle}`, `ADEP ${plan.origin.ident}`];
    if (plan.sid && sidRunway !== undefined) {
        header.push(`DEPRWY ${withRw(sidRunway)}`, `SID ${plan.sid.name}`);
        if (plan.sid.transition !== undefined)
            header.push(`SIDTRANS ${plan.sid.transition}`);
    }
    header.push(`ADES ${plan.dest.ident}`);
    if (plan.star && starRunway !== undefined) {
        header.push(`DESRWY ${withRw(starRunway)}`, `STAR ${plan.star.name}`);
        if (plan.star.transition !== undefined)
            header.push(`STARTRANS ${plan.star.transition}`);
    }
    if (named && plan.approach) {
        header.push(`APP ${plan.approach.name}`);
        if (plan.approach.transition !== undefined)
            header.push(`APPTRANS ${plan.approach.transition}`);
    }
    const lines = [pointLine(plan.origin, 'ADEP', 0)];
    for (const leg of plan.legs) {
        if (expandedBySim(leg.via))
            continue;
        const via = leg.via === 'DCT' || leg.via === 'DRCT' || isProcedure(leg.via) ? 'DRCT' : leg.via;
        lines.push(pointLine(leg, via, plan.cruiseAltitudeFt));
    }
    lines.push(pointLine(plan.dest, 'ADES', 0));
    return [...header, `NUMENR ${lines.length}`, ...lines].map((l) => `${l}\n`).join('');
}
