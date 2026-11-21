// Moved from Kansei's helper (stage-2b-voice).
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {isAbsolute, join} from 'node:path';

const PACK_APT: readonly string[] = ['Earth nav data', 'apt.dat'];
export const STOCK_APT: readonly string[] = ['Global Scenery', 'Global Airports', 'Earth nav data', 'apt.dat'];
export const ATC_CANDIDATES: readonly (readonly string[])[] = [
  ['Custom Data', '1200 atc data', 'Earth nav data', 'atc.dat'],
  ['Resources', 'default scenery', '1200 atc data', 'Earth nav data', 'atc.dat'],
];

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const GLOBAL_AIRPORTS = Symbol('*GLOBAL_AIRPORTS*');

/** The pack folders in scenery_packs.ini order; the stock airports' place in the order is the GLOBAL_AIRPORTS marker, if the ini has one. */
function packsFromIni(xplaneRoot: string, ini: string): (string | typeof GLOBAL_AIRPORTS)[] {
  const packs: (string | typeof GLOBAL_AIRPORTS)[] = [];
  for (const raw of readFileSync(ini, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('SCENERY_PACK ')) continue;
    const path = line.slice('SCENERY_PACK '.length).trim();
    if (path === '*GLOBAL_AIRPORTS*') packs.push(GLOBAL_AIRPORTS);
    else packs.push(isAbsolute(path) ? path : join(xplaneRoot, path));
  }
  return packs;
}

function packsByName(scenery: string): string[] {
  if (!existsSync(scenery)) return [];
  return readdirSync(scenery, {withFileTypes: true})
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((name) => join(scenery, name));
}

/**
 * Airport files of an X-Plane folder, highest priority first: add-on packs in scenery_packs.ini order,
 * with the stock file where the ini lists `*GLOBAL_AIRPORTS*`, or last when the ini has no such line or
 * there is no ini. Only files that exist.
 */
export function findAptFiles(xplaneRoot: string): string[] {
  const scenery = join(xplaneRoot, 'Custom Scenery');
  const ini = join(scenery, 'scenery_packs.ini');
  const packs = isFile(ini) ? packsFromIni(xplaneRoot, ini) : packsByName(scenery);
  const stock = join(xplaneRoot, ...STOCK_APT);
  const files: string[] = [];
  const add = (file: string): void => {
    if (isFile(file) && !files.includes(file)) files.push(file);
  };
  for (const pack of packs) add(pack === GLOBAL_AIRPORTS ? stock : join(pack, ...PACK_APT));
  add(stock);
  return files;
}

const DATA_FOLDERS = [['Custom Data'], ['Resources', 'default data']];

/** A navigation data file by name: `Custom Data` first, then `Resources/default data`. Null when neither has it. */
export function findDataFile(xplaneRoot: string, ...name: string[]): string | null {
  for (const folder of DATA_FOLDERS) {
    const file = join(xplaneRoot, ...folder, ...name);
    if (isFile(file)) return file;
  }
  return null;
}

/** The folder has CIFP procedure data: a `CIFP` folder in `Custom Data` or `Resources/default data`. */
export function hasCifp(xplaneRoot: string): boolean {
  return DATA_FOLDERS.some((folder) => {
    try {
      return statSync(join(xplaneRoot, ...folder, 'CIFP')).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Reads an airport's CIFP file by id (`CIFP/<ID>.dat`), or null when there is none or the id is not a plain airport id. */
export function readCifpFrom(xplaneRoot: string): (id: string) => Promise<string | null> {
  return async (id) => {
    if (!/^[A-Z0-9]{1,8}$/.test(id)) return null;
    const file = findDataFile(xplaneRoot, 'CIFP', `${id}.dat`);
    return file === null ? null : readFile(file, 'utf8');
  };
}

/** The X-Plane ATC file: `Custom Data` first, then the default scenery's. Null when neither exists. */
export function findAtcFile(xplaneRoot: string): string | null {
  for (const parts of ATC_CANDIDATES) {
    const file = join(xplaneRoot, ...parts);
    if (isFile(file)) return file;
  }
  return null;
}
