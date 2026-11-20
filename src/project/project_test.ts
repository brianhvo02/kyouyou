import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProjectJson,
  parseChangelog,
  parseFeatures,
  parseRoadmap,
  projectJsonPlugin,
  ProjectSourceError,
  writeProjectJson,
  type ProjectMeta,
} from './project.ts';

const CHANGELOG = `# Changelog

An intro paragraph about this log.

## [Unreleased]

### Added

- A new thing.

## [0.2.0] - 2026-11-19

Some prose before the first heading, ignored.

### Added

- A **bold** and \`code\` item that wraps
  onto a second line.
- Another one.

### Changed

- Changed something.

### Fixed

- Fixed it.

### Removed

- Removed it.

## [0.1.0] - 2026-10-01

### Added

- First release.

[Unreleased]: https://example.com/compare/v0.2.0...HEAD
`;

const ROADMAP = `# Roadmap

## Now

- Do this.
- Do that.

## Next

## Later

- Someday.

## Not planned

- Never.
`;

const README = `# App

## Features

- **Charts from your folder.** Terminal charts… Nothing is uploaded.
- Plain bullet. With a detail sentence.

## Other

- not a feature
`;

const META: ProjectMeta = { id: 'kokuzu', name: 'Demo', summary: 'A demo.', url: 'https://example.com' };

describe('parseChangelog', () => {
  it('reads unreleased and versions newest first', () => {
    const r = parseChangelog(CHANGELOG);
    expect(r.unreleased).toEqual({ added: ['A new thing.'], changed: [], fixed: [], removed: [] });
    expect(r.versions.map((v) => v.version)).toEqual(['0.2.0', '0.1.0']);
    expect(r.versions[0]).toEqual({
      version: '0.2.0',
      date: '2026-11-19',
      added: ['A **bold** and `code` item that wraps onto a second line.', 'Another one.'],
      changed: ['Changed something.'],
      fixed: ['Fixed it.'],
      removed: ['Removed it.'],
    });
    expect(r.versions[1]?.added).toEqual(['First release.']);
  });

  it('throws on a malformed version heading', () => {
    expect(() => parseChangelog('## [0.1] - 2026-11-19\n')).toThrow(ProjectSourceError);
    expect(() => parseChangelog('## [0.1.0] - 19/11/2026\n')).toThrow(ProjectSourceError);
    expect(() => parseChangelog('## 0.2.0 - 2026-11-20\n')).toThrow(ProjectSourceError);
    expect(() => parseChangelog('## Notes\n')).toThrow(ProjectSourceError);
  });
});

describe('parseRoadmap', () => {
  it('reads the four sections', () => {
    expect(parseRoadmap(ROADMAP)).toEqual({
      now: ['Do this.', 'Do that.'],
      next: [],
      later: ['Someday.'],
      notPlanned: ['Never.'],
    });
  });

  it('gives [] for a missing Not planned', () => {
    expect(parseRoadmap('## Now\n\n- a\n').notPlanned).toEqual([]);
  });
});

describe('parseFeatures', () => {
  it('splits a bold summary from the detail', () => {
    expect(parseFeatures(README)).toEqual([
      { summary: 'Charts from your folder.', detail: 'Terminal charts… Nothing is uploaded.' },
      { summary: 'Plain bullet.', detail: 'With a detail sentence.' },
    ]);
  });
});

describe('buildProjectJson', () => {
  const sources = { changelog: CHANGELOG, roadmap: ROADMAP, readme: README };

  it('sets released from the matching version', () => {
    const p = buildProjectJson(META, '0.1.0', sources);
    expect(p.schema).toBe(1);
    expect(p.version).toBe('0.1.0');
    expect(p.released).toBe('2026-10-01');
    expect(p.changelog).toHaveLength(2);
    expect(p.id).toBe('kokuzu');
    expect(p.features).toHaveLength(2);
  });

  it('throws when the version is missing', () => {
    expect(() => buildProjectJson(META, '9.9.9', sources)).toThrow(ProjectSourceError);
  });

  it.each(['/Users/someone/x', 'C:\\x', '~/x', '=~/x', '"~/x', 'me@my-pc'])('throws for private detail %s', (bad) => {
    const changelog = CHANGELOG.replace('- Another one.', `- Saw ${bad} here.`);
    expect(() => buildProjectJson(META, '0.2.0', { ...sources, changelog })).toThrow(ProjectSourceError);
    const roadmap = ROADMAP.replace('- Do this.', `- ${bad}`);
    expect(() => buildProjectJson(META, '0.2.0', { ...sources, roadmap })).toThrow(ProjectSourceError);
  });

  it.each(['/home/x', ' /Users/x', '(~/x', 'me@host', 'a@b.c'])('throws for private detail %s (narrowed rules)', (bad) => {
    const changelog = CHANGELOG.replace('- Another one.', `- Saw ${bad} here.`);
    expect(() => buildProjectJson(META, '0.2.0', { ...sources, changelog })).toThrow(ProjectSourceError);
    const start = CHANGELOG.replace('- Another one.', bad);
    expect(() => buildProjectJson(META, '0.2.0', { ...sources, changelog: start })).toThrow(ProjectSourceError);
  });

  it.each([
    'Updated `@types/node` and `@vitejs/plugin-react`',
    '@types/node',
    'See https://example.com/home/docs now',
    'See https://host/~user/ now',
    'Contact <owner@example.com> now',
    'See https://example.com/Users/guide',
  ])('allows %s', (ok) => {
    const changelog = CHANGELOG.replace('- Another one.', `- ${ok}.`);
    expect(() => buildProjectJson(META, '0.2.0', { ...sources, changelog })).not.toThrow();
  });

  it('allows an address only inside angle brackets', () => {
    const changelog = CHANGELOG.replace('- Another one.', '- Contact <owner@example.com> now.');
    expect(() => buildProjectJson(META, '0.2.0', { ...sources, changelog })).not.toThrow();
    const bare = CHANGELOG.replace('- Another one.', '- Contact owner@example.com now.');
    expect(() => buildProjectJson(META, '0.2.0', { ...sources, changelog: bare })).toThrow(ProjectSourceError);
  });
});

function callHook(plugin: object, name: 'buildStart' | 'generateBundle', ctx: object): void {
  const hook = (plugin as Record<string, unknown>)[name] as ((this: object) => void) | { handler: (this: object) => void };
  (typeof hook === 'function' ? hook : hook.handler).call(ctx);
}

describe('project.json writer and plugin', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function makeRoot(version: string): string {
    const root = mkdtempSync(join(tmpdir(), 'project-test-'));
    dirs.push(root);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'demo', version }));
    writeFileSync(join(root, 'CHANGELOG.md'), CHANGELOG);
    writeFileSync(join(root, 'ROADMAP.md'), ROADMAP);
    writeFileSync(join(root, 'README.md'), README);
    return root;
  }

  it('writeProjectJson writes pretty JSON with a trailing newline and returns it', () => {
    const root = makeRoot('0.2.0');
    const out = join(root, 'project.json');
    const project = writeProjectJson(META, root, out);
    const text = readFileSync(out, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toBe(`${JSON.stringify(project, null, 2)}\n`);
    expect(project.version).toBe('0.2.0');
    expect(project.released).toBe('2026-11-19');
  });

  it('writeProjectJson throws ProjectSourceError for a version missing from the changelog', () => {
    const root = makeRoot('9.9.9');
    expect(() => writeProjectJson(META, root, join(root, 'project.json'))).toThrow(ProjectSourceError);
  });

  it('writeProjectJson throws ProjectSourceError for a missing source file', () => {
    const root = makeRoot('0.2.0');
    rmSync(join(root, 'ROADMAP.md'));
    expect(() => writeProjectJson(META, root, join(root, 'project.json'))).toThrow(ProjectSourceError);
  });

  it('plugin emits project.json once in generateBundle', () => {
    const root = makeRoot('0.2.0');
    const plugin = projectJsonPlugin(META, root);
    const emitFile = vi.fn();
    const ctx = { emitFile, error: (m: string): never => { throw new Error(m); } };
    callHook(plugin, 'buildStart', ctx);
    callHook(plugin, 'generateBundle', ctx);
    expect(emitFile).toHaveBeenCalledTimes(1);
    const arg = emitFile.mock.calls[0]?.[0] as { type: string; fileName: string; source: string };
    expect(arg.type).toBe('asset');
    expect(arg.fileName).toBe('project.json');
    expect(JSON.parse(arg.source).version).toBe('0.2.0');
    expect(arg.source.endsWith('\n')).toBe(true);
  });

  it('plugin config defines __PROJECT_VERSION__ from package.json', () => {
    const root = makeRoot('0.2.0');
    const plugin = projectJsonPlugin(META, root) as { config?: () => unknown };
    expect(plugin.config?.()).toEqual({ define: { __PROJECT_VERSION__: '"0.2.0"' } });
  });

  it('plugin buildStart fails the build on a version missing from the changelog', () => {
    const root = makeRoot('9.9.9');
    const plugin = projectJsonPlugin(META, root);
    const error = vi.fn((m: string): never => { throw new Error(m); });
    const ctx = { emitFile: vi.fn(), error };
    expect(() => callHook(plugin, 'buildStart', ctx)).toThrow(/9\.9\.9/);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
