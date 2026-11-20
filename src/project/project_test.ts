import { describe, expect, it } from 'vitest';
import {
  buildProjectJson,
  parseChangelog,
  parseFeatures,
  parseRoadmap,
  ProjectSourceError,
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

  it.each(['/Users/someone/x', 'C:\\x', '~/x', 'me@my-pc'])('throws for private detail %s', (bad) => {
    const changelog = CHANGELOG.replace('- Another one.', `- Saw ${bad} here.`);
    expect(() => buildProjectJson(META, '0.2.0', { ...sources, changelog })).toThrow(ProjectSourceError);
    const roadmap = ROADMAP.replace('- Do this.', `- ${bad}`);
    expect(() => buildProjectJson(META, '0.2.0', { ...sources, roadmap })).toThrow(ProjectSourceError);
  });

  it('allows an address only inside angle brackets', () => {
    const changelog = CHANGELOG.replace('- Another one.', '- Contact <owner@example.com> now.');
    expect(() => buildProjectJson(META, '0.2.0', { ...sources, changelog })).not.toThrow();
    const bare = CHANGELOG.replace('- Another one.', '- Contact owner@example.com now.');
    expect(() => buildProjectJson(META, '0.2.0', { ...sources, changelog: bare })).toThrow(ProjectSourceError);
  });
});
