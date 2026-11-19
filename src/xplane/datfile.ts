// Shared by the readers of X-Plane's .dat navigation files (earth_fix, earth_nav, earth_awy, earth_hold,
// earth_msa, earth_mora): the first line is the byte order (`I` or `A`), the second starts with the spec
// version (`1200 Version - …`), data rows follow with fields separated by any whitespace, and a `99` line
// ends the data.

export interface DatFile {
  /** The version number at the start of the second line, e.g. '1200'; '' if there is none. */
  version: string;
  /** The data rows, each split on whitespace; blank lines and everything from `99` on left out. */
  rows: string[][];
}

export function datRows(text: string): DatFile {
  const lines = text.split(/\r?\n/);
  const version = (lines[1] ?? '').trim().split(/\s+/)[0] ?? '';
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;
    if (line === '99') break;
    rows.push(line.split(/\s+/));
  }
  return {version, rows};
}
