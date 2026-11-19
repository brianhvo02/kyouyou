// Reader for X-Plane's ATC file, `1200 atc data/Earth nav data/atc.dat` (in Custom Data or X-Plane's
// default scenery). Based on the Kansei helper's reader, with its agreement; this one also reads the
// tower keywords ICAO, TRANSITION_ALT and CLASS.
//
// Layout: a header (`A`, a version line, `ATCFILE`), then blocks
//
//   CONTROLLER
//   NAME <name>  FACILITY_ID <id>  ROLE ctr|tracon|twr  [ICAO <id>] [TRANSITION_ALT <ft>] [CLASS <A–G>]
//   FREQ <tens of kHz>…  CHAN <kHz>…  VOICE_DEF …  ALT_REPORT …
//   AIRSPACE_POLYGON_BEGIN <floorFt> <ceilingFt>  POINT <lat> <lon>…  AIRSPACE_POLYGON_END   (one or more)
//   CONTROLLER_END
//
// and `99` at the end. Lines may end in CRLF. Never throws: a block cut short (no CONTROLLER_END before
// the next CONTROLLER or the end of the file) or with an unknown ROLE is left out; unknown keywords and
// POINT outside a polygon are ignored. Controllers are not unique by facility id and role: the file
// repeats some. Rings are usually open (the first point is not repeated).
import { pointInPolygon } from "../geo/polygon.js";
const ROLES = ['ctr', 'tracon', 'twr'];
/** Search order for controllersAt: the most local controller first. */
const ROLE_ORDER = ['twr', 'tracon', 'ctr'];
function isRole(value) {
    return ROLES.includes(value);
}
/** A frequency in tens of kHz, in kHz: one ending in 2 or 7 is the 25 kHz channel it was cut from (12347 -> 123475). */
export function tenKhzToKhz(value) {
    const last = value % 10;
    return value * 10 + (last === 2 || last === 7 ? 5 : 0);
}
function addKhz(khz, value) {
    if (Number.isFinite(value) && !khz.includes(value))
        khz.push(value);
}
/** The controllers in atc.dat text, in file order. */
export function parseAtc(text) {
    const controllers = [];
    let draft = null;
    let area = null;
    // An area with an unreadable limit or point is left out.
    let areaBad = false;
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        const space = line.search(/\s/);
        const keyword = space < 0 ? line : line.slice(0, space);
        const rest = space < 0 ? '' : line.slice(space).trim();
        if (keyword === 'CONTROLLER') {
            draft = { name: '', facilityId: '', role: '', khz: [], areas: [] };
            area = null;
        }
        else if (draft === null) {
            continue;
        }
        else if (keyword === 'NAME') {
            draft.name = rest;
        }
        else if (keyword === 'FACILITY_ID') {
            draft.facilityId = rest;
        }
        else if (keyword === 'ROLE') {
            draft.role = rest;
        }
        else if (keyword === 'ICAO' && rest !== '') {
            draft.icao = rest;
        }
        else if (keyword === 'TRANSITION_ALT' && /^\d+$/.test(rest)) {
            draft.transitionAltitudeFt = Number(rest);
        }
        else if (keyword === 'CLASS' && rest !== '') {
            draft.airspaceClass = rest;
        }
        else if (keyword === 'FREQ') {
            if (/^\d+$/.test(rest))
                addKhz(draft.khz, tenKhzToKhz(Number(rest)));
        }
        else if (keyword === 'CHAN') {
            if (/^\d+$/.test(rest))
                addKhz(draft.khz, Number(rest));
        }
        else if (keyword === 'AIRSPACE_POLYGON_BEGIN') {
            const [floor, ceiling] = rest.split(/\s+/);
            area = { floorFt: Number(floor), ceilingFt: Number(ceiling), ring: [] };
            areaBad = !Number.isFinite(area.floorFt) || !Number.isFinite(area.ceilingFt);
        }
        else if (keyword === 'POINT' && area !== null) {
            const [lat, lon] = rest.split(/\s+/);
            const p = { lat: Number(lat), lon: Number(lon) };
            if (Number.isFinite(p.lat) && Number.isFinite(p.lon))
                area.ring.push(p);
            else
                areaBad = true;
        }
        else if (keyword === 'AIRSPACE_POLYGON_END') {
            if (area !== null && !areaBad)
                draft.areas.push(area);
            area = null;
        }
        else if (keyword === 'CONTROLLER_END') {
            if (isRole(draft.role)) {
                const { role, ...restOfDraft } = draft;
                controllers.push({ ...restOfDraft, role });
            }
            draft = null;
            area = null;
        }
    }
    return controllers;
}
/**
 * Controllers with an area that contains the point and whose floor <= altFt <= ceiling, each with that
 * area's floor and ceiling. Order: twr, then tracon, then ctr.
 */
export function controllersAt(all, lat, lon, altFt) {
    const found = [];
    for (const role of ROLE_ORDER) {
        for (const c of all) {
            if (c.role !== role)
                continue;
            const a = c.areas.find((x) => x.floorFt <= altFt && altFt <= x.ceilingFt && pointInPolygon(lat, lon, x.ring));
            if (a !== undefined) {
                const { areas: _areas, ...summary } = c;
                found.push({ ...summary, floorFt: a.floorFt, ceilingFt: a.ceilingFt });
            }
        }
    }
    return found;
}
