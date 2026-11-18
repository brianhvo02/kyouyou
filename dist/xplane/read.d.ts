/**
 * 'no-flight': X-Plane answers but has no flight loaded (its dataref count is 0); retried like 'unavailable'.
 * There is deliberately no staleness check: a paused simulator sends almost no updates, so silence is not
 * a sign of a dead connection. A dead socket shows itself through its close or error event instead.
 */
export type SimState = 'off' | 'connecting' | 'connected' | 'unavailable' | 'no-flight';
export interface SimBase {
    httpBase: string;
    wsBase: string;
}
export type DatarefValue = number | string | number[];
export interface WebSocketLike {
    onopen: (() => void) | null;
    onmessage: ((e: {
        data: unknown;
    }) => void) | null;
    onclose: (() => void) | null;
    onerror: (() => void) | null;
    send(data: string): void;
    close(): void;
}
export interface SimReaderOptions<K extends string> {
    base: SimBase;
    /** The caller's key -> X-Plane dataref name. */
    datarefs: Readonly<Record<K, string>>;
    /** A failed lookup of one of these means 'unavailable'. Default: none. */
    required?: readonly K[];
    /** Each HTTP request, and the opening of the WebSocket, is abandoned after this long. Default 8000. */
    timeoutMs?: number;
    fetch?: typeof fetch;
    WebSocket?: new (url: string) => WebSocketLike;
    now?: () => number;
}
export interface SimReader<K extends string> {
    readonly state: SimState;
    connect(): void;
    disconnect(): void;
    onValues(cb: (values: Partial<Record<K, DatarefValue>>, at: number) => void): () => void;
    onState(cb: (state: SimState) => void): () => void;
    /**
     * Reads datarefs once over HTTP, by X-Plane name. For values that are read rather than watched,
     * such as the aircraft's identity. Names X-Plane does not know are left out of the result.
     * Values are X-Plane's raw data: text datarefs arrive as base64, which `decodeText` turns into a string.
     * Rejects with an Error when the reader is not in the `connected` state, on a failed request and on a timeout.
     */
    read(names: readonly string[]): Promise<Record<string, DatarefValue>>;
}
/** 'https://host:1/x/' -> {httpBase: 'https://host:1/x', wsBase: 'wss://host:1/x'}; http -> ws. */
export declare function simBaseFromUrl(url: string): SimBase;
/**
 * The text of a data dataref such as sim/aircraft/view/acf_ICAO. X-Plane's web API sends those as base64 of a
 * fixed-size byte buffer padded with NUL bytes. Returns the text up to the first NUL, decoded as UTF-8, or null
 * when the value is not a string or is not valid base64.
 */
export declare function decodeText(value: DatarefValue | undefined): string | null;
export declare function createSimReader<K extends string>(opts: SimReaderOptions<K>): SimReader<K>;
