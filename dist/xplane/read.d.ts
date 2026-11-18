export type SimState = 'off' | 'connecting' | 'connected' | 'unavailable';
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
    /** A failed lookup of one of these means 'unavailable'. */
    required: readonly K[];
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
}
/** 'https://host:1/x/' -> {httpBase: 'https://host:1/x', wsBase: 'wss://host:1/x'}; http -> ws. */
export declare function simBaseFromUrl(url: string): SimBase;
export declare function createSimReader<K extends string>(opts: SimReaderOptions<K>): SimReader<K>;
