type FolderKind = 'xplane' | 'jeppesen' | 'xplane-airports';
export type FakeFolders = Partial<Record<FolderKind, Record<string, string | Uint8Array>>>;
/** A fetch-shaped handler: pass it where an app's code takes a fetch, or use startFakeKuukou for HTTP. */
export declare function fakeKuukouHandler(folders: FakeFolders): (req: Request) => Promise<Response>;
export interface FakeKuukou {
    /** The server's base URL, e.g. http://127.0.0.1:54321 */
    url: string;
    close(): Promise<void>;
}
/** Starts the stand-in on 127.0.0.1 (a free port unless given), for end-to-end tests. */
export declare function startFakeKuukou(folders: FakeFolders, port?: number): Promise<FakeKuukou>;
export {};
