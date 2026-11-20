// Reader for X-Plane's per-airport procedure files (CIFP/$ICAO.dat, spec XP CIFP1101 / XP CIFP1250).
// Model-neutral: it keeps approaches, altitude limits, speed limits and path terminators, and leaves
// resolving fixes and choosing a data model to the caller.
//
// Each line is `ROWCODE:field,field,...;` with optional further `;` groups. Handled row codes are
// SID, STAR, APPCH (legs) and RWY. Anything else (PRDAT and so on) is ignored. An optional
// `I` / `<version> Version` header is skipped.
import { makeLeg, parseElevation, parseFeet, parseLat, parseLon, procedureCollector } from "../arinc424/procedures.js";
const ROW_KINDS = { SID: 'sid', STAR: 'star', APPCH: 'approach' };
/** Never throws. Rows it cannot read are skipped. */
export function parseCifp(text) {
    const runways = [];
    const skipped = [];
    const procedures = procedureCollector();
    let transitionAltitudeFt = null;
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
            runways.push({ ident, lat, lon, elevationFt: parseElevation(f[3] ?? '') });
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
        const leg = makeLeg({
            seq,
            fix: f[4] ?? '',
            region: f[5] ?? '',
            pathTerm: f[11] ?? '',
            // Not trimmed: the leading spaces of '  M ' are positions.
            descriptor: rawFields[8] ?? '',
            altDesc: f[22] ?? '',
            alt1: f[23] ?? '',
            alt2: f[24] ?? '',
            course: f[20] ?? '',
            speed: f[27] ?? '',
            turn: f[9] ?? '',
            navaid: f[13] ?? '',
            navaidRegion: f[14] ?? '',
            arcRadius: f[17] ?? '',
            theta: f[18] ?? '',
            rho: f[19] ?? '',
            distance: f[21] ?? '',
            verticalAngle: f[28] ?? '',
            centre: f[30] ?? '',
            centreRegion: f[31] ?? '',
        });
        procedures.add(kind, name, f[1] ?? '', f[3] ?? '', leg);
    });
    return { runways, procedures: procedures.finish(), transitionAltitudeFt, skipped };
}
