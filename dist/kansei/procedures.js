// Moved from Kansei's helper (stage-2b-voice).
import { parseCifp } from "../xplane/cifp.js";
/** True for the route names that are shared parts: a runway ('RW28L'), 'ALL', or an approach's final (''). */
function isCommon(name) {
    return name === '' || name === 'ALL' || name.startsWith('RW');
}
/** The airport's procedures from the text of its CIFP file, with leg positions from the fix index. */
export function airportProcedures(id, cifpText, fixes, airport) {
    const cifp = parseCifp(cifpText);
    const runways = cifp.runways.map((r) => ({ name: r.ident, lat: r.lat, lon: r.lon }));
    const position = (leg) => {
        const found = fixes.find(leg.fix, leg.region, id);
        if (found !== null)
            return found;
        if (leg.fix === id && airport)
            return { lat: airport.lat, lon: airport.lon };
        if (leg.fix.startsWith('RW')) {
            const end = runways.find((r) => r.name === leg.fix.slice(2));
            if (end)
                return { lat: end.lat, lon: end.lon };
        }
        return null;
    };
    const toLeg = (leg) => {
        const at = position(leg);
        return { fix: leg.fix === '' ? null : leg.fix, lat: at?.lat ?? null, lon: at?.lon ?? null, pathTerm: leg.pathTerm, alt: leg.alt, speedKt: leg.speedKt, courseDeg: leg.courseTrue ? null : leg.courseDeg };
    };
    const toRoute = (route) => ({
        name: route.name.startsWith('RW') ? route.name.slice(2) : route.name,
        legs: route.legs.filter((l) => !l.missed).map(toLeg),
    });
    const procedures = cifp.procedures.map((p) => {
        const common = [];
        const transitions = [];
        for (const route of p.routes)
            (isCommon(route.name) ? common : transitions).push(toRoute(route));
        return {
            kind: p.kind, name: p.name,
            ...(p.approachType === undefined ? {} : { approachType: p.approachType }),
            ...(p.runway === undefined ? {} : { runway: p.runway }),
            ...(p.variant === undefined ? {} : { variant: p.variant }),
            common, transitions,
        };
    });
    return { id, transitionAltitudeFt: cifp.transitionAltitudeFt, procedures, runways };
}
