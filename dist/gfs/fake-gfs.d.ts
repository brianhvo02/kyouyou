import type { Mock } from 'vitest';
import type { GribField } from './grib2.ts';
import type { GfsVar } from './noaa-index.ts';
export declare const HOUR_MS = 3600000;
export declare const NOW: Date;
export declare const RUN_12Z: number;
export declare const RUN_06Z: number;
export declare const NX = 360;
export declare const NY = 181;
export declare const KT_PER_MS: number;
/** A 360 x 181 field whose value at (row, col) is `fn(lat of row, col)`. */
export declare function field(fn: (lat: number, col: number) => number, over?: Partial<GribField>): GribField;
export declare const PARAM: Record<GfsVar, [number, number]>;
/** Level key in labels: hPa number or 'sfc'. */
export type LevelKey = number | 'sfc';
/**
 * The test atmosphere: U is 0; V is -(hpa / 25 + fh / 3) m/s (a north wind whose
 * speed tells level and forecast hour apart); TMP is -hpa / 5 C plus lat / 10.
 * Surface: U = -5, V = 0 (from 90 at 9.72 kt).
 */
export declare function fakeField(v: GfsVar, level: LevelKey, runIso: string, fh: number): GribField;
export declare const MSG_BYTES = 64;
export declare const LEVELS: LevelKey[];
/** A forecast file of fake messages (a label padded to MSG_BYTES) and its index text. */
export declare function fakeFile(runMs: number, fh: number): {
    bytes: Uint8Array<ArrayBuffer>;
    idx: string;
};
/** Decodes a fake message (one label padded with zeros). */
export declare function fakeDecode(bytes: Uint8Array): GribField | undefined;
export interface FakeServer {
    fetch: Mock<(input: string, init?: RequestInit) => Promise<Response>>;
    /** URL + range of every request, in order. */
    log: string[];
}
export interface ServerOpts {
    /** Runs whose files exist (default: 12Z and 06Z). */
    runs?: number[];
    /** Index URLs answered 404 even though the run exists. */
    missingIdx?: string[];
    /** Override for a range response. */
    rangeResponse?: (bytes: Uint8Array<ArrayBuffer>) => Response;
    /** Index lines left out of every index of one run, e.g. ':TMP:250 mb:'. */
    dropFromIdx?: {
        runMs: number;
        line: string;
    };
}
export declare function server(opts?: ServerOpts): FakeServer;
