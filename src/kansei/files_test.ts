// Moved from Kansei's helper (stage-2b-voice).
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect, test} from 'vitest';
import {findAptFiles, findAtcFile, findDataFile, hasCifp, readCifpFrom} from './files.ts';

function xplaneFolder(): string {
  const root = mkdtempSync(join(tmpdir(), 'xplane-'));
  mkdirSync(join(root, 'Global Scenery', 'Global Airports', 'Earth nav data'), {recursive: true});
  writeFileSync(join(root, 'Global Scenery', 'Global Airports', 'Earth nav data', 'apt.dat'), '99\n');
  return root;
}

function pack(root: string, name: string, withApt: boolean): string {
  const dir = join(root, 'Custom Scenery', name, 'Earth nav data');
  mkdirSync(dir, {recursive: true});
  if (withApt) writeFileSync(join(dir, 'apt.dat'), '99\n');
  return join(dir, 'apt.dat');
}

test('findAptFiles lists add-on airport files in scenery_packs.ini order, skips disabled packs and packs without an apt.dat, and puts the stock file last', () => {
  const root = xplaneFolder();
  const a = pack(root, 'A', true);
  const b = pack(root, 'B', true);
  pack(root, 'C', true);
  pack(root, 'D', false);
  writeFileSync(join(root, 'Custom Scenery', 'scenery_packs.ini'), [
    'I', '1000 Version', 'SCENERY', '',
    'SCENERY_PACK Custom Scenery/B/',
    'SCENERY_PACK_DISABLED Custom Scenery/C/',
    'SCENERY_PACK Custom Scenery/D/',
    'SCENERY_PACK Custom Scenery/Missing/',
    `SCENERY_PACK ${join(root, 'Custom Scenery', 'A')}/`,
    'SCENERY_PACK *GLOBAL_AIRPORTS*',
    '',
  ].join('\r\n'));
  const stock = join(root, 'Global Scenery', 'Global Airports', 'Earth nav data', 'apt.dat');
  expect(findAptFiles(root)).toEqual([b, a, stock]);
});

test('findAptFiles falls back to pack-name order when there is no scenery_packs.ini', () => {
  const root = xplaneFolder();
  const b = pack(root, 'B', true);
  const a = pack(root, 'A', true);
  pack(root, 'D', false);
  const stock = join(root, 'Global Scenery', 'Global Airports', 'Earth nav data', 'apt.dat');
  expect(findAptFiles(root)).toEqual([a, b, stock]);
});

test('findAptFiles puts the stock file where *GLOBAL_AIRPORTS* is listed', () => {
  const root = xplaneFolder();
  const a = pack(root, 'A', true);
  const b = pack(root, 'B', true);
  writeFileSync(join(root, 'Custom Scenery', 'scenery_packs.ini'), [
    'I', '1000 Version', 'SCENERY', '',
    'SCENERY_PACK Custom Scenery/B/',
    'SCENERY_PACK *GLOBAL_AIRPORTS*',
    'SCENERY_PACK Custom Scenery/A/',
    '',
  ].join('\n'));
  const stock = join(root, 'Global Scenery', 'Global Airports', 'Earth nav data', 'apt.dat');
  expect(findAptFiles(root)).toEqual([b, stock, a]);
});

test('findAptFiles keeps the stock file last when the ini has no *GLOBAL_AIRPORTS* line', () => {
  const root = xplaneFolder();
  const a = pack(root, 'A', true);
  writeFileSync(join(root, 'Custom Scenery', 'scenery_packs.ini'), 'I\n1000 Version\nSCENERY\nSCENERY_PACK Custom Scenery/A/\n');
  const stock = join(root, 'Global Scenery', 'Global Airports', 'Earth nav data', 'apt.dat');
  expect(findAptFiles(root)).toEqual([a, stock]);
});

function dataFile(root: string, parts: string[], text: string): string {
  const file = join(root, ...parts);
  mkdirSync(join(file, '..'), {recursive: true});
  writeFileSync(file, text);
  return file;
}

test('findDataFile takes Custom Data first, then Resources/default data, else null', () => {
  const root = mkdtempSync(join(tmpdir(), 'xplane-'));
  expect(findDataFile(root, 'earth_fix.dat')).toBeNull();
  const stock = dataFile(root, ['Resources', 'default data', 'earth_fix.dat'], 'stock');
  expect(findDataFile(root, 'earth_fix.dat')).toBe(stock);
  const custom = dataFile(root, ['Custom Data', 'earth_fix.dat'], 'custom');
  expect(findDataFile(root, 'earth_fix.dat')).toBe(custom);
});

test('readCifpFrom reads Custom Data/CIFP first, falls back to the default data, and null when neither has it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'xplane-'));
  dataFile(root, ['Resources', 'default data', 'CIFP', 'XAAA.dat'], 'stock aaa');
  dataFile(root, ['Resources', 'default data', 'CIFP', 'XBBB.dat'], 'stock bbb');
  dataFile(root, ['Custom Data', 'CIFP', 'XBBB.dat'], 'custom bbb');
  const read = readCifpFrom(root);
  expect(await read('XAAA')).toBe('stock aaa');
  expect(await read('XBBB')).toBe('custom bbb');
  expect(await read('XCCC')).toBeNull();
});

test('readCifpFrom refuses an id that is not a plain airport id', async () => {
  const root = mkdtempSync(join(tmpdir(), 'xplane-'));
  dataFile(root, ['Custom Data', 'secret.dat'], 'secret');
  expect(await readCifpFrom(root)('../secret')).toBeNull();
});

test('findAtcFile takes Custom Data first, then Resources/default scenery, else null', () => {
  const root = mkdtempSync(join(tmpdir(), 'xplane-'));
  expect(findAtcFile(root)).toBeNull();
  const stock = dataFile(root, ['Resources', 'default scenery', '1200 atc data', 'Earth nav data', 'atc.dat'], 'stock');
  expect(findAtcFile(root)).toBe(stock);
  const custom = dataFile(root, ['Custom Data', '1200 atc data', 'Earth nav data', 'atc.dat'], 'custom');
  expect(findAtcFile(root)).toBe(custom);
});

test('hasCifp is true for a CIFP folder in Custom Data or in Resources/default data, false otherwise', () => {
  const none = xplaneFolder();
  expect(hasCifp(none)).toBe(false);
  const custom = xplaneFolder();
  mkdirSync(join(custom, 'Custom Data', 'CIFP'), {recursive: true});
  expect(hasCifp(custom)).toBe(true);
  const stock = xplaneFolder();
  mkdirSync(join(stock, 'Resources', 'default data', 'CIFP'), {recursive: true});
  expect(hasCifp(stock)).toBe(true);
  const file = xplaneFolder();
  mkdirSync(join(file, 'Custom Data'), {recursive: true});
  writeFileSync(join(file, 'Custom Data', 'CIFP'), 'x');
  expect(hasCifp(file)).toBe(false);
});
