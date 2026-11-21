// Moved from Kansei's helper (stage-2b-voice).
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect, test} from 'vitest';
import {airportsNear, indexApt, indexAptFiles, parseAirport, readAirport} from './apt.ts';
import type {AptIndexEntry} from './apt.ts';

const ALPHA = [
  '1 213 0 0 XAAA Alpha Intl',
  '1302 icao_code XAAA',
  '100 40.00 1 0 0.25 1 2 0 08 42.00000000 -95.00000000 0 0 3 0 0 0 26 42.02000000 -95.04000000 0 0 3 0 0 0',
  '1050 126775 ATIS',
  '1052 119325 CLNC DEL',
  '1053 122175 GND',
  '1054 118600 TWR',
  '1055 127475 ALPHA APP',
  '54 11860 TWR OLD',
].join('\n');
const HELI = ['17 40 0 0 H01 Heli One', '1302 datum_lat 43.5', '1302 datum_lon -94.5', '1053 123375 HELI GND'].join('\n');
const NOPOS = ['1 5 0 0 XNOPOS Nowhere Field'].join('\n');
const FILE = `I\n1200 Version - made up\n\n${ALPHA}\n\n${HELI}\n\n${NOPOS}\n\n99\n`;
const ADDON = `I\n1200 Version - made up\n\n1 13 0 0 XAAA Alpha Addon\n1053 122225 GND\n\n99\n`;

function tempFile(name: string, content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'apt-')), name);
  writeFileSync(path, content);
  return path;
}

test('parseAirport reads the header, runways and frequencies', () => {
  const a = parseAirport(ALPHA);
  expect(a).not.toBeNull();
  expect(a?.id).toBe('XAAA');
  expect(a?.icao).toBe('XAAA');
  expect(a?.name).toBe('Alpha Intl');
  expect(a?.elevationFt).toBe(213);
  expect(a?.runways[0]?.ends.map(e => e.name)).toEqual(['08', '26']);
  expect(a?.runways[0]?.widthM).toBe(40);
  expect(a?.lat).toBeCloseTo(42.01, 6);
  expect(a?.lon).toBeCloseTo(-95.02, 6);
  expect(a?.frequencies).toContainEqual({role: 'ground', khz: 122175, name: 'GND'});
  expect(a?.frequencies).toContainEqual({role: 'approach', khz: 127475, name: 'ALPHA APP'});
  expect(a?.frequencies).toContainEqual({role: 'atis', khz: 126775, name: 'ATIS'});
  expect(a?.frequencies).toContainEqual({role: 'clearance', khz: 119325, name: 'CLNC DEL'});
});

test('an old-style frequency row is in tens of kilohertz', () => {
  expect(parseAirport(ALPHA)?.frequencies).toContainEqual({role: 'tower', khz: 118600, name: 'TWR OLD'});
});

test('an airport without runways uses its datum', () => {
  const a = parseAirport(HELI);
  expect(a?.lat).toBe(43.5);
  expect(a?.lon).toBe(-94.5);
  expect(a?.runways).toEqual([]);
});

test('indexApt finds every airport with byte ranges that parse back', async () => {
  const path = tempFile('apt.dat', FILE);
  const index = await indexApt(path);
  expect(index.map(e => e.id)).toEqual(['XAAA', 'H01', 'XNOPOS']);
  expect(index.every(e => e.file === path)).toBe(true);
  const alpha = index[0] as AptIndexEntry;
  const slice = Buffer.from(FILE).subarray(alpha.offset, alpha.offset + alpha.length).toString();
  expect(slice.startsWith('1 213 0 0 XAAA')).toBe(true);
  expect(await readAirport(alpha)).toEqual(parseAirport(slice));
  expect(index.map(e => e.hasTower)).toEqual([true, false, false]);
  expect(index[0]?.lat).toBeCloseTo(42.01, 6);
  expect(index[1]?.lat).toBe(43.5);
  expect(index[2]?.lat).toBeNaN();
  expect(index[2]?.lon).toBeNaN();
});

test('indexAptFiles keeps the airport from the earlier file when two files have the same id', async () => {
  const a = tempFile('addon.dat', ADDON);
  const b = tempFile('apt.dat', FILE);
  const index = await indexAptFiles([a, b]);
  expect(index).toHaveLength(3);
  const alpha = index.find(e => e.id === 'XAAA') as AptIndexEntry;
  expect(alpha.file).toBe(a);
  const airport = await readAirport(alpha);
  expect(airport?.name).toBe('Alpha Addon');
  expect(airport?.frequencies).toContainEqual({role: 'ground', khz: 122225, name: 'GND'});
});

test('reads CRLF files', async () => {
  const lf = await indexApt(tempFile('lf.dat', FILE));
  const crlf = await indexApt(tempFile('crlf.dat', FILE.replaceAll('\n', '\r\n')));
  expect(crlf.map(e => e.id)).toEqual(['XAAA', 'H01', 'XNOPOS']);
  expect(crlf.map(e => e.name)).toEqual(lf.map(e => e.name));
  const a = await readAirport(crlf[0] as AptIndexEntry);
  expect(a).toEqual(await readAirport(lf[0] as AptIndexEntry));
  expect(a?.frequencies.every(f => !f.name.includes('\r'))).toBe(true);
  expect(parseAirport(ALPHA.replaceAll('\n', '\r\n'))?.name).toBe('Alpha Intl');
});

test('airportsNear sorts by distance, skips airports with no position, and respects the limit', async () => {
  const index = await indexApt(tempFile('apt.dat', FILE));
  const near = airportsNear(index, 42.0, -95.0, 200, 10);
  expect(near.map(s => s.id)).toEqual(['XAAA', 'H01']);
  expect(near[0]?.distanceNm).toBeLessThan(1.5);
  expect(near[0]?.hasTower).toBe(true);
  expect(Math.round((near[1]?.distanceNm ?? 0) * 10) / 10).toBe(near[1]?.distanceNm);
  expect(airportsNear(index, 42.0, -95.0, 200, 1).map(s => s.id)).toEqual(['XAAA']);
  expect(airportsNear(index, 42.0, -95.0, 20, 10).map(s => s.id)).toEqual(['XAAA']);
  expect(Object.keys(near[0] ?? {}).sort()).toEqual(['distanceNm', 'hasTower', 'id', 'lat', 'lon', 'name']);
});

test('parseAirport returns null for text with no header row', () => {
  expect(parseAirport('1302 icao_code XAAA\n1053 122175 GND')).toBeNull();
  expect(parseAirport('')).toBeNull();
});

test('an old-style row ending in 2 or 7 is the 25 kHz channel; a kHz row is kept as written', () => {
  const a = parseAirport(['1 213 0 0 XMUP Made Up', '100 40.00 1 0 0.25 1 2 0 08 42.0 -95.0 0 0 3 0 0 0 26 42.02 -95.04 0 0 3 0 0 0',
    '53 12267 GND OLD', '54 11852 TWR OLD', '1055 127472 APP NEW'].join('\n'));
  expect(a?.frequencies).toContainEqual({role: 'ground', khz: 122675, name: 'GND OLD'});
  expect(a?.frequencies).toContainEqual({role: 'tower', khz: 118525, name: 'TWR OLD'});
  expect(a?.frequencies).toContainEqual({role: 'approach', khz: 127472, name: 'APP NEW'});
});
