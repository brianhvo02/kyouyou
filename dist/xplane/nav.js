// Reader for X-Plane's earth_nav.dat (specs XP NAV1150 and XP NAV1200). Based on Kouro's reader, with
// its agreement, widened from NDB and VOR to every row type. Row: code, lat, lon, elevation (ft),
// frequency, range, value, ident, terminal airport or ENRT, ICAO region, [runway], name.
//
// Fields are kept as written; their meaning depends on the row code (NAV1200, check the spec for detail):
//   2 NDB            frequency whole kHz; range = class code; value = BFO flag
//   3 VOR/VORTAC     frequency tens of kHz (11500 = 115.00 MHz); range = class code; value = slaved variation
//   4 LOC (ILS) 5 LOC frequency tens of kHz; value = magnetic front course × 360 + true bearing
//                    (front course = Math.floor(value / 360), true bearing = value % 360)
//   6 GS             frequency tens of kHz; value = glide angle × 100000 + true bearing
//   7 OM 8 MM 9 IM   value = true bearing
//   12 DME (ILS) 13 DME  frequency tens of kHz; value = DME bias NM
//   14 FPAP 15 GLS 16 LTP/FTP  path points of SBAS/GBAS approaches; range is a length with decimals; see the spec
// Rows 4–9 and 14–16 have a runway column before the name; 12 has none. Never throws: unknown row codes
// and malformed rows are skipped; an unsupported version gives nothing.
import { datRows } from "./datfile.js";
const KINDS = {
    2: 'ndb', 3: 'vor', 4: 'loc-ils', 5: 'loc', 6: 'gs', 7: 'om', 8: 'mm', 9: 'im',
    12: 'dme-ils', 13: 'dme', 14: 'fpap', 15: 'gls', 16: 'ltp',
};
const WITH_RUNWAY = new Set([4, 5, 6, 7, 8, 9, 14, 15, 16]);
const VERSIONS = ['1150', '1200'];
export function parseNav(text) {
    const { version, rows } = datRows(text);
    if (!VERSIONS.includes(version))
        return [];
    const out = [];
    for (const c of rows) {
        const kind = KINDS[c[0]];
        if (kind === undefined || c.length < 10)
            continue;
        const code = Number(c[0]);
        const [lat, lon, elev, freq, range, value] = c.slice(1, 7).map(Number);
        if (![lat, lon, elev, freq, range, value].every(Number.isFinite))
            continue;
        const hasRunway = WITH_RUNWAY.has(code) && c.length > 10;
        out.push({
            code, kind, lat, lon, elevationFt: elev, frequency: freq, range, value,
            ident: c[7], airport: c[8] === 'ENRT' ? null : c[8], region: c[9],
            runway: hasRunway ? c[10] : null, name: c.slice(hasRunway ? 11 : 10).join(' '),
        });
    }
    return out;
}
