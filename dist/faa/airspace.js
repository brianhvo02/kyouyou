// Reader for restrictive airspace in ARINC 424-18: section U, subsection R ("UR") records, 132 columns a
// line, as in the FAA's CIFP file FAACIFP18 (US special-use airspace) and in any file with that layout.
// It gives each area the shape `kyouyuu/xplane/airspace` reads from X-Plane's airspace.txt, so the same
// checks (`airspacesAt`) work on both, plus what the ARINC record adds.
//
// Read, 1-based columns: 7–8 ICAO region, 9 restrictive type, 10–19 designation, 20 multiple code,
// 21–24 sequence, 25 continuation number, 27 time code, 28 NOTAM, 31–32 boundary via, 33–51 point,
// 52–70 arc origin, 71–74 arc distance (tenths of a NM), 82–86 lower limit and 87 its unit, 88–92 upper
// limit and 93 its unit, 94–123 name. Limits: GND, MSL, feet, FLnnn, UNLTD, and NOTSP or NOTAM (unknown). Primary records only (continuation 0 or 1); later continuations
// (times, remarks) are passed over. Every other record is ignored, not skipped.
//
// Boundary via, first character: G great circle and H rhumb line (corners kept as written), L and R
// counter-clockwise and clockwise arcs about the arc origin to the next point, C a circle about the arc
// origin. Second character E ends the area. Arcs and circles become points no more than 1 NM apart.
import { initialBearingDeg } from "../geo/geo.js";
import { destinationPoint } from "../geo/track.js";
import { parseLat, parseLon } from "../arinc424/procedures.js";
/** Restrictive airspace areas in ARINC 424-18 lines. Takes lines, so a caller can stream; never throws. */
export function parseRestrictiveAirspace(lines) {
    const groups = new Map();
    let lineNo = 0;
    for (const raw of lines) {
        lineNo++;
        const r = (raw.endsWith('\r') ? raw.slice(0, -1) : raw).padEnd(132);
        const col = (from, to = from) => r.slice(from - 1, to);
        if (col(1) !== 'S' || col(5) !== 'U' || col(6) !== 'R')
            continue;
        if (col(25) !== '0' && col(25) !== '1')
            continue;
        const lat = parseLat(col(33, 41)), lon = parseLon(col(42, 51));
        const oLat = parseLat(col(52, 60)), oLon = parseLon(col(61, 70));
        const dist = col(71, 74);
        const rec = {
            line: lineNo,
            seq: /^\d{4}$/.test(col(21, 24)) ? Number(col(21, 24)) : NaN,
            via: col(31, 32),
            point: lat !== undefined && lon !== undefined ? { lat, lon } : undefined,
            origin: oLat !== undefined && oLon !== undefined ? { lat: oLat, lon: oLon } : undefined,
            radiusNm: /^\d{4}$/.test(dist) ? Number(dist) / 10 : undefined,
            lower: col(82, 86).trim(),
            lowerUnit: col(87).trim(),
            upper: col(88, 92).trim(),
            upperUnit: col(93).trim(),
            name: col(94, 123).trim(),
            time: col(27).trim(),
            notam: col(28).trim(),
            type: col(9),
            designation: col(10, 19).trim(),
            region: col(7, 8).trim(),
            multi: col(20).trim(),
        };
        const key = `${col(2, 4)}\u0000${col(7, 20)}`;
        const g = groups.get(key);
        if (g === undefined)
            groups.set(key, [rec]);
        else
            g.push(rec);
    }
    const areas = [];
    const skipped = [];
    for (const recs of groups.values()) {
        const sorted = [...recs].sort((a, b) => a.seq - b.seq);
        const first = sorted[0];
        const limits = sorted.find((r) => r.lower !== '' || r.upper !== '') ?? first;
        const floor = parseLimit(limits.lower, limits.lowerUnit, 'floor');
        const ceiling = parseLimit(limits.upper, limits.upperUnit, 'ceiling');
        if (floor === null || ceiling === null) {
            skipped.push({ line: first.line, reason: 'area with an unreadable limit' });
            continue;
        }
        const ring = ringOf(sorted);
        if (ring === null) {
            skipped.push({ line: first.line, reason: 'area with an unreadable point' });
            continue;
        }
        if (ring.length < 3) {
            skipped.push({ line: first.line, reason: 'area with fewer than three points' });
            continue;
        }
        areas.push({
            class: first.type,
            name: sorted.find((r) => r.name !== '')?.name ?? '',
            designation: first.designation,
            region: first.region,
            multipleCode: first.multi,
            timeCode: limits.time === '' ? null : limits.time,
            notam: limits.notam === '' ? null : limits.notam,
            floor,
            ceiling,
            floorText: text(limits.lower, limits.lowerUnit),
            ceilingText: text(limits.upper, limits.upperUnit),
            ring,
        });
    }
    return { areas, skipped };
}
function text(value, unit) {
    return unit === '' ? value : `${value} ${unit}`;
}
/** GND, MSL (sea level), feet with unit A (above ground) or M (MSL), FLnnn, UNLTD, NOTSP and NOTAM; anything else is null. */
function parseLimit(value, unit, which) {
    if (value === 'GND')
        return { ft: 0, ref: 'GND' };
    if (value === 'MSL')
        return { ft: 0, ref: 'MSL' };
    if (value === 'UNLTD')
        return { ft: Infinity, ref: 'MSL' };
    // Not specified, or set by NOTAM: an unknown limit makes a warning more likely, not less.
    if (value === 'NOTSP' || value === 'NOTAM')
        return which === 'floor' ? { ft: 0, ref: 'GND' } : { ft: Infinity, ref: 'MSL' };
    if (/^FL\d{3}$/.test(value))
        return { ft: Number(value.slice(2)) * 100, ref: 'MSL' };
    if (/^\d{1,5}$/.test(value)) {
        if (unit === 'A')
            return { ft: Number(value), ref: 'GND' };
        if (unit === 'M')
            return { ft: Number(value), ref: 'MSL' };
    }
    return null;
}
const STEP_NM = 1;
/** The area's boundary as points, or null when a record it needs cannot be read. */
function ringOf(recs) {
    const ring = [];
    for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        const kind = r.via[0];
        if (kind === 'C') {
            if (r.origin === undefined || r.radiusNm === undefined || r.radiusNm <= 0)
                return null;
            const n = Math.max(8, Math.ceil((2 * Math.PI * r.radiusNm) / STEP_NM));
            for (let k = 0; k < n; k++)
                ring.push(destinationPoint(r.origin.lat, r.origin.lon, (360 * k) / n, r.radiusNm));
        }
        else if (kind === 'G' || kind === 'H') {
            if (r.point === undefined)
                return null;
            ring.push(r.point);
        }
        else if (kind === 'L' || kind === 'R') {
            if (r.point === undefined || r.origin === undefined || r.radiusNm === undefined || r.radiusNm <= 0)
                return null;
            ring.push(r.point);
            // The arc runs to the next record's point, or back to the first when this record ends the area.
            const end = r.via[1] === 'E' || i === recs.length - 1 ? recs[0].point : recs[i + 1].point;
            if (end === undefined)
                return null;
            const b1 = initialBearingDeg(r.origin.lat, r.origin.lon, r.point.lat, r.point.lon);
            const b2 = initialBearingDeg(r.origin.lat, r.origin.lon, end.lat, end.lon);
            const sweep = kind === 'R' ? (((b2 - b1) % 360) + 360) % 360 : -((((b1 - b2) % 360) + 360) % 360);
            const n = Math.ceil((Math.abs(sweep) * Math.PI * r.radiusNm) / 180 / STEP_NM);
            for (let k = 1; k < n; k++)
                ring.push(destinationPoint(r.origin.lat, r.origin.lon, b1 + (sweep * k) / n, r.radiusNm));
        }
        else {
            return null;
        }
        if (r.via[1] === 'E')
            break;
    }
    return ring;
}
