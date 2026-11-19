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
