// Turns an app's CHANGELOG.md, ROADMAP.md and README "Features" list into project.json (schema 1)
// for the hub dashboard. A line-based reader; it imports nothing and has no dependencies.

export type ProjectId = 'kouro' | 'kokuzu' | 'kansei' | 'kyouyou';

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
  changelog: Array<ChangeSet & {version: string; date: string}>;
  unreleased: ChangeSet;
  roadmap: {now: string[]; next: string[]; later: string[]; notPlanned: string[]};
  features: Array<{summary: string; detail: string}>;
}

export interface ProjectMeta {
  id: ProjectId;
  name: string;
  summary: string;
  url: string;
}

export class ProjectSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectSourceError';
  }
}

const emptyChangeSet = (): ChangeSet => ({added: [], changed: [], fixed: [], removed: []});

const BULLET = /^\s*[-*]\s+(.*)$/;

/** Bullets of a block of lines; a bullet continues over following non-blank, non-bullet lines. */
function bullets(lines: readonly string[]): string[] {
  const out: string[] = [];
  let open = false;
  for (const line of lines) {
    const m = BULLET.exec(line);
    if (m) {
      out.push((m[1] ?? '').trim());
      open = true;
    } else if (line.trim() === '') {
      open = false;
    } else if (open) {
      out[out.length - 1] += ` ${line.trim()}`;
    }
  }
  return out;
}

/** Splits lines at headings of the given prefix (`## ` or `### `); lines before the first heading are dropped. */
function sections(lines: readonly string[], prefix: string): Array<{heading: string; lines: string[]}> {
  const out: Array<{heading: string; lines: string[]}> = [];
  for (const line of lines) {
    if (line.startsWith(prefix)) out.push({heading: line.slice(prefix.length).trim(), lines: []});
    else out[out.length - 1]?.lines.push(line);
  }
  return out;
}

const splitLines = (md: string): string[] => md.split(/\r?\n/);

function changeSet(lines: readonly string[]): ChangeSet {
  const set = emptyChangeSet();
  for (const sec of sections(lines, '### ')) {
    const key = sec.heading.toLowerCase();
    if (key === 'added' || key === 'changed' || key === 'fixed' || key === 'removed') set[key].push(...bullets(sec.lines));
  }
  return set;
}

const VERSION_HEADING = /^\[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/;

export function parseChangelog(md: string): {unreleased: ChangeSet; versions: Array<ChangeSet & {version: string; date: string}>} {
  let unreleased = emptyChangeSet();
  const versions: Array<ChangeSet & {version: string; date: string}> = [];
  for (const sec of sections(splitLines(md), '## ')) {
    if (/^\[unreleased\]$/i.test(sec.heading)) {
      unreleased = changeSet(sec.lines);
      continue;
    }
    const m = VERSION_HEADING.exec(sec.heading);
    if (!m) throw new ProjectSourceError(`Malformed changelog heading: "## ${sec.heading}" (expected "## [x.y.z] - YYYY-MM-DD")`);
    versions.push({version: m[1] ?? '', date: m[2] ?? '', ...changeSet(sec.lines)});
  }
  return {unreleased, versions};
}

export function parseRoadmap(md: string): ProjectJson['roadmap'] {
  const roadmap: ProjectJson['roadmap'] = {now: [], next: [], later: [], notPlanned: []};
  for (const sec of sections(splitLines(md), '## ')) {
    const key = sec.heading.toLowerCase();
    if (key === 'now') roadmap.now = bullets(sec.lines);
    else if (key === 'next') roadmap.next = bullets(sec.lines);
    else if (key === 'later') roadmap.later = bullets(sec.lines);
    else if (key === 'not planned') roadmap.notPlanned = bullets(sec.lines);
  }
  return roadmap;
}

function splitFeature(text: string): {summary: string; detail: string} {
  const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(text);
  if (bold) return {summary: (bold[1] ?? '').trim(), detail: (bold[2] ?? '').trim()};
  const i = text.indexOf('. ');
  if (i < 0) return {summary: text, detail: ''};
  return {summary: text.slice(0, i + 1), detail: text.slice(i + 2).trim()};
}

export function parseFeatures(readme: string): ProjectJson['features'] {
  const sec = sections(splitLines(readme), '## ').find((s) => s.heading.toLowerCase() === 'features');
  return sec ? bullets(sec.lines).map(splitFeature) : [];
}

const PRIVATE: Array<[RegExp, string]> = [
  [/\/(?:Users|home)\/\S/, 'a local path'],
  [/(?:^|[^A-Za-z])[A-Za-z]:\\/, 'a Windows path'],
  [/~\//, 'a home-folder path'],
  [/[^\s@<>]+@[^\s@<>]+/, 'an address or login@machine'],
];

function checkPrivate(text: string, where: string): void {
  const plain = text.replace(/<[^<>\s@]+@[^<>\s@]+>/g, '');
  for (const [re, what] of PRIVATE) {
    if (re.test(plain)) throw new ProjectSourceError(`${where} holds ${what}: "${text}"`);
  }
}

export function buildProjectJson(
  meta: ProjectMeta,
  version: string,
  sources: {changelog: string; roadmap: string; readme: string},
): ProjectJson {
  const {unreleased, versions} = parseChangelog(sources.changelog);
  const current = versions.find((v) => v.version === version);
  if (!current) throw new ProjectSourceError(`CHANGELOG.md has no entry for version ${version}`);
  const project: ProjectJson = {
    schema: 1,
    id: meta.id,
    name: meta.name,
    summary: meta.summary,
    url: meta.url,
    version,
    released: current.date,
    changelog: versions,
    unreleased,
    roadmap: parseRoadmap(sources.roadmap),
    features: parseFeatures(sources.readme),
  };
  const texts: Array<[string, string]> = [['name', meta.name], ['summary', meta.summary], ['url', meta.url]];
  const sets: Array<[string, ChangeSet]> = [['unreleased', unreleased], ...versions.map((v): [string, ChangeSet] => [v.version, v])];
  for (const [label, set] of sets) {
    for (const k of ['added', 'changed', 'fixed', 'removed'] as const) for (const t of set[k]) texts.push([`changelog ${label} ${k}`, t]);
  }
  for (const [k, list] of Object.entries(project.roadmap)) for (const t of list) texts.push([`roadmap ${k}`, t]);
  for (const f of project.features) texts.push(['features', `${f.summary} ${f.detail}`]);
  for (const [where, t] of texts) checkPrivate(t, where);
  return project;
}
