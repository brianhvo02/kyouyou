import type { Plugin } from 'vite';
export type ProjectId = 'kouro' | 'kokuzu' | 'kansei' | 'koho' | 'kyouyou';
export interface ChangeSet {
    added: string[];
    changed: string[];
    fixed: string[];
    removed: string[];
}
export interface ProjectJson {
    schema: 1;
    id: ProjectId;
    name: string;
    summary: string;
    url: string;
    version: string;
    released: string;
    changelog: Array<ChangeSet & {
        version: string;
        date: string;
    }>;
    unreleased: ChangeSet;
    roadmap: {
        now: string[];
        next: string[];
        later: string[];
        notPlanned: string[];
    };
    features: Array<{
        summary: string;
        detail: string;
    }>;
}
export interface ProjectMeta {
    id: ProjectId;
    name: string;
    summary: string;
    url: string;
}
export declare class ProjectSourceError extends Error {
    constructor(message: string);
}
export declare function parseChangelog(md: string): {
    unreleased: ChangeSet;
    versions: Array<ChangeSet & {
        version: string;
        date: string;
    }>;
};
export declare function parseRoadmap(md: string): ProjectJson['roadmap'];
export declare function parseFeatures(readme: string): ProjectJson['features'];
export declare function buildProjectJson(meta: ProjectMeta, version: string, sources: {
    changelog: string;
    roadmap: string;
    readme: string;
}): ProjectJson;
/** Reads the sources from `root` and writes project.json to `outFile`. */
export declare function writeProjectJson(meta: ProjectMeta, root: string, outFile: string): ProjectJson;
/**
 * Vite plugin: emits project.json into the build output; a bad source fails the build.
 * It also defines `__PROJECT_VERSION__` (the package.json version, a string) for the app;
 * declare it with `declare const __PROJECT_VERSION__: string`.
 */
export declare function projectJsonPlugin(meta: ProjectMeta, root?: string): Plugin;
