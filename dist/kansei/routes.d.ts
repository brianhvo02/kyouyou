import type { IncomingMessage, ServerResponse } from 'node:http';
import { indexAptFiles } from './apt.ts';
import type { AptIndexEntry } from './apt.ts';
import type { FixIndex } from './fixes.ts';
import type { Controller, HelperStatus } from './types.ts';
export * from './files.ts';
export { indexAptFiles } from './apt.ts';
export type { AptIndexEntry } from './apt.ts';
export { indexFixes } from './fixes.ts';
export type { FixIndex } from './fixes.ts';
export { parseAtc } from '../xplane/atc.ts';
export type * from './types.ts';
export interface KanseiData {
    index: readonly AptIndexEntry[];
    controllers: readonly Controller[];
    /** The text of an airport's CIFP file, or null when there is none. Called once per airport; the answer is cached. */
    readCifp?: (id: string) => Promise<string | null>;
    /** Fix and navaid positions. Default: none, so legs have no positions. */
    fixes?: FixIndex;
    /** The text of earth_msa.dat, or null when there is none (every airport then has no MSAs). */
    msaText?: string | null;
}
export interface KanseiRoutesOptions {
    /** The folder that plans may be saved into. Undefined: plan saving is off and the plan routes answer 403. */
    plansDir?: string;
    /** Called with the file-system error when a plan cannot be saved; the page only sees a generic message. */
    onPlanError?: (error: Error) => void;
    /**
     * Replaces some of the file-system and timing operations behind plan saving.
     * @internal For tests and hosts' tests; may change.
     */
    fsOps?: Partial<PlanFsOps>;
}
/**
 * The file-system and timing operations that putting a plan in place relies on; tests replace them to simulate Windows failures.
 * @internal For tests and hosts' tests; may change.
 */
export interface PlanFsOps {
    rename: (from: string, to: string) => Promise<void>;
    link: (from: string, to: string) => Promise<void>;
    copyFile: (from: string, to: string, mode: number) => Promise<void>;
    rm: (path: string) => Promise<void>;
    pause: (ms: number) => Promise<void>;
}
export interface KanseiRoutes {
    /**
     * `path` is the request target after the host's prefix, raw (with its query): `/status`, `/airport/XAAA`,
     * `/plans/A.fms?overwrite=1`. Returns false, writing nothing, when it is not one of these routes (the host answers 404).
     */
    handle(req: IncomingMessage, res: ServerResponse, path: string): boolean;
}
export declare const PLAN_LIMIT_BYTES = 262144;
/**
 * True for the lookup routes (the ones that need the index), false for plans and anything else.
 * @internal For tests and hosts' tests; may change.
 */
export declare function isDataPath(pathname: string): boolean;
export declare function createKanseiRoutesFromData(data: KanseiData, opts?: KanseiRoutesOptions): KanseiRoutes;
export interface KanseiStatus extends HelperStatus {
    ready: boolean;
    /** The X-Plane folder the routes were built from. */
    root: string | null;
    /** The folder has CIFP procedure data. */
    cifp: boolean;
    /** The folder has an atc.dat. */
    atc: boolean;
    /** The folder has an earth_msa.dat. */
    msa: boolean;
}
export interface KanseiFolderRoutes extends KanseiRoutes {
    /**
     * Resolves when the index is built. Rejects with the build's error when the build fails, and with Error('closed')
     * when `close()` is called before the build finishes. Hosts must attach a catch.
     */
    ready: Promise<void>;
    /**
     * The status once ready; `{error: 'indexing'}` while building and after `close()`, `{error: 'index failed'}` after a
     * failure (until `close()`).
     */
    status(): KanseiStatus | {
        error: string;
    };
    /**
     * Drops the index. From then on every lookup, `/status` included, answers 503 `{error: 'indexing'}`, whether or not the
     * build had failed; a build still running is abandoned and `ready` rejects with Error('closed'). Plans keep answering.
     */
    close(): void;
}
export interface KanseiFolderOptions extends KanseiRoutesOptions {
    xplaneRoot: string;
    /**
     * Replaces the airport indexer.
     * @internal For tests and hosts' tests; may change.
     */
    deps?: {
        /** @internal For tests and hosts' tests; may change. */
        indexAptFiles?: typeof indexAptFiles;
    };
}
/** Routes over an X-Plane folder. The index is built in the background from the constructor on; plans answer at once. */
export declare function createKanseiRoutes(opts: KanseiFolderOptions): KanseiFolderRoutes;
