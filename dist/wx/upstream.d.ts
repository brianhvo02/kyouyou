/** The path the app asks its own origin for. */
export declare const WX_PATH = "/wx";
/** NOAA's URL for one airport's latest METAR (with its TAF), or an error for anything that isn't an ICAO ident. */
export declare function wxUpstream(search: string): {
    url: string;
} | {
    error: string;
};
/** Asks NOAA and answers as the relay does: its JSON passed through, or a short JSON error. */
export declare function relayWx(search: string, doFetch?: typeof fetch): Promise<{
    status: number;
    body: string;
}>;
/** The path the app asks its own origin for weather hazards: /wx/hazards?kind=sigmet. Callers send `Cache-Control: public, max-age=300`. */
export declare const HAZARDS_PATH = "/wx/hazards";
/** NOAA's GeoJSON URL for one kind of hazard (sigmet, isigmet or gairmet), or an error for any other request. */
export declare function hazardsUpstream(search: string): {
    url: string;
} | {
    error: string;
};
/**
 * Asks NOAA for a hazard collection and answers as the relay does: its GeoJSON FeatureCollection passed through
 * unchanged, or a short JSON error. Callers set `Cache-Control: public, max-age=300` on a 200.
 */
export declare function relayHazards(search: string, doFetch?: typeof fetch): Promise<{
    status: number;
    body: string;
}>;
