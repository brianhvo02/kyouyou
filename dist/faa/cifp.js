// Reader for the FAA's CIFP file FAACIFP18: ARINC 424-18, one 132-column record per line, every airport
// in one file. It gives each airport the same `CifpAirport` that `kyouyou/xplane/cifp` reads from an
// X-Plane per-airport file, by the same rules (shared in ../arinc424/procedures.ts).
//
// Read: airport section P (column 5, column 6 blank) with subsection (column 13) D SID, E STAR,
// F approach and G runway, plus A (the airport record) for its transition altitude. Primary records only (continuation number 0 or 1); continuation records
// (2 and up) carry nothing this shape keeps and are passed over. Every other record (header, enroute,
// heliports, terminal NDBs and so on) is ignored, not skipped.
import { makeLeg, parseElevation, parseFeet, parseLat, parseLon, procedureCollector } from "../arinc424/procedures.js";
const SUBSECTIONS = { D: 'sid', E: 'star', F: 'approach' };
const NAMES = { sid: 'SID', star: 'STAR', approach: 'approach' };
/**
 * The FAA's FAACIFP18 as airports keyed by ICAO id. Takes lines, so a caller can stream the file
 * (Node `readline`, say); a trailing CR is dropped. Never throws: unreadable records go in their airport's
 * `skipped`, or in the file-level `skipped` when they name no airport.
 */
export function parseFaaCifp(lines) {
    const building = new Map();
    const skipped = [];
    // Transition altitude from each airport record (columns 71–75); used for airports read from the other records.
    const airportTa = new Map();
    let lineNo = 0;
    for (const raw of lines) {
        lineNo++;
        const r = (raw.endsWith('\r') ? raw.slice(0, -1) : raw).padEnd(132);
        // 1-based columns, as in the ARINC 424 layout.
        const col = (from, to = from) => r.slice(from - 1, to);
        const sub = col(13);
        if (col(1) !== 'S' || col(5) !== 'P' || col(6) !== ' ' || !'ADEFG'.includes(sub) || sub === ' ')
            continue;
        if (sub === 'A') {
            if (/^[01]$/.test(col(22)))
                airportTa.set(col(7, 10).trim(), parseFeet(col(71, 75).trim()));
            continue;
        }
        const ident = col(7, 10).trim();
        if (ident === '') {
            skipped.push({ line: lineNo, reason: 'airport record without an airport id' });
            continue;
        }
        let a = building.get(ident);
        if (a === undefined) {
            a = { runways: [], procedures: procedureCollector(), transitionAltitudeFt: null, skipped: [] };
            building.set(ident, a);
        }
        if (sub === 'G') {
            if (/^[2-9A-Z]$/.test(col(22)))
                continue;
            const rwy = col(14, 18).trim().replace(/^RW/, '');
            const lat = parseLat(col(33, 41));
            const lon = parseLon(col(42, 51));
            if (rwy === '' || lat === undefined || lon === undefined) {
                a.skipped.push({ line: lineNo, reason: 'runway record without a readable runway or threshold position' });
                continue;
            }
            a.runways.push({ ident: rwy, lat, lon, elevationFt: parseElevation(col(67, 71).trim()) });
            continue;
        }
        const kind = SUBSECTIONS[sub] ?? 'sid';
        const cont = col(39);
        const seq = col(27, 29);
        const name = col(14, 19).trim();
        if (!/^[0-9A-Z]$/.test(cont) || !/^\d{3}$/.test(seq) || name === '') {
            a.skipped.push({ line: lineNo, reason: `malformed ${NAMES[kind]} record` });
            continue;
        }
        if (cont !== '0' && cont !== '1')
            continue;
        if (a.transitionAltitudeFt === null)
            a.transitionAltitudeFt = parseFeet(col(95, 99).trim());
        const leg = makeLeg({
            seq: Number(seq),
            fix: col(30, 34).trim(),
            region: col(35, 36).trim(),
            pathTerm: col(48, 49).trim(),
            descriptor: col(40, 43),
            altDesc: col(83),
            alt1: col(85, 89).trim(),
            alt2: col(90, 94).trim(),
            course: col(71, 74).trim(),
            speed: col(100, 102).trim(),
            turn: col(44).trim(),
            navaid: col(51, 54).trim(),
            navaidRegion: col(55, 56).trim(),
            arcRadius: col(57, 62).trim(),
            theta: col(63, 66).trim(),
            rho: col(67, 70).trim(),
            distance: col(75, 78).trim(),
            verticalAngle: col(103, 106).trim(),
            centre: col(107, 111).trim(),
            centreRegion: col(113, 114).trim(),
        });
        a.procedures.add(kind, name, col(20).trim(), col(21, 25).trim(), leg);
    }
    const airports = new Map();
    for (const [ident, a] of building) {
        const transitionAltitudeFt = airportTa.get(ident) ?? a.transitionAltitudeFt;
        airports.set(ident, { runways: a.runways, procedures: a.procedures.finish(), transitionAltitudeFt, skipped: a.skipped });
    }
    return { airports, skipped };
}
