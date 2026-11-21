// Moved from Kansei's helper (stage-2b-voice).
import {expect, test} from 'vitest';
import {indexFixes} from './fixes.ts';
import {airportProcedures} from './procedures.ts';

// Made-up lines in the column layout of X-Plane's CIFP files. Nothing here is copied from real data.
interface L { row?: string; seq?: string; type?: string; proc: string; trans?: string; fix?: string; region?: string; desc?: string; pt?: string; altDesc?: string; alt1?: string; speed?: string; course?: string }
function leg(l: L): string {
  const f = Array.from({length: 36}, () => ' ');
  f[0] = l.seq ?? '010';
  f[1] = l.type ?? '1';
  f[2] = l.proc;
  f[3] = l.trans ?? ' ';
  f[4] = l.fix ?? ' ';
  f[5] = l.region ?? 'K2';
  f[6] = 'P';
  f[7] = 'C';
  f[8] = l.desc ?? 'E   ';
  f[11] = l.pt ?? 'TF';
  f[20] = l.course ?? '    ';
  f[22] = l.altDesc ?? ' ';
  f[23] = l.alt1 ?? '     ';
  f[25] = '18000';
  f[27] = l.speed ?? '   ';
  return `${l.row ?? 'SID'}:${f.join(',')};`;
}
const rwy = (id: string, lat: string, lon: string): string => `RWY:RW${id},+0000,      ,00100, ,IXYZ,9,   ;${lat},${lon},0000;`;

const FIX = [' 42.500000000  -95.500000000  QXONE ENRT K2 4530000 QXONE', ' 42.600000000  -95.400000000  TRANS ENRT K2 4530000 TRANS'].join('\n');
const fixes = indexFixes(FIX, '');

const CIFP = [
  rwy('35L', 'N42360000', 'W095120000'),
  leg({proc: 'TESTT2', trans: 'RW35L', fix: 'RW35L', pt: 'CA'}),
  leg({seq: '020', proc: 'TESTT2', trans: 'RW35L', fix: 'QXONE', altDesc: '-', alt1: '10000', speed: '210', course: '2510'}),
  leg({seq: '010', type: '3', proc: 'TESTT2', trans: 'TRANS', fix: 'TRANS'}),
  leg({seq: '020', type: '3', proc: 'TESTT2', trans: 'TRANS', fix: 'NOWHR'}),
  leg({seq: '010', type: '5', proc: 'TESTT2', trans: 'ALL', fix: 'QXONE'}),
  leg({row: 'APPCH', seq: '010', type: 'A', proc: 'R06LY', trans: 'TRANS', fix: 'TRANS'}),
  leg({row: 'APPCH', seq: '010', type: 'R', proc: 'R06LY', trans: ' ', fix: 'QXONE'}),
  leg({row: 'APPCH', seq: '020', type: 'R', proc: 'R06LY', trans: ' ', fix: 'RW06L', desc: 'E   '}),
  leg({row: 'APPCH', seq: '030', type: 'R', proc: 'R06LY', trans: ' ', fix: 'MISSD', desc: 'E M '}),
  leg({row: 'APPCH', seq: '010', type: 'I', proc: 'I24R', trans: ' ', fix: 'QXONE'}),
  rwy('06L', 'N42420000', 'W095060000'),
].join('\n');

function find(name: string): ReturnType<typeof airportProcedures>['procedures'][number] {
  const p = airportProcedures('XAAA', CIFP, fixes).procedures.find((x) => x.name === name);
  if (!p) throw new Error(`no ${name}`);
  return p;
}

test('gives legs their fix positions', () => {
  const sid = find('TESTT2');
  const rw = sid.common.find((r) => r.name === '35L');
  expect(rw?.legs[1]).toMatchObject({fix: 'QXONE', lat: 42.5, lon: -95.5, pathTerm: 'TF', alt: {kind: 'at-or-below', ft: 10000}, speedKt: 210, courseDeg: 251});
  expect(rw?.legs[0]?.courseDeg).toBeNull();
  expect(rw?.legs[0]).toMatchObject({fix: 'RW35L', lat: 42.6, lon: -95.2});
  expect(airportProcedures('XAAA', CIFP, fixes).runways[0]).toEqual({name: '35L', lat: 42.6, lon: -95.2});
  expect(airportProcedures('XAAA', CIFP, fixes).transitionAltitudeFt).toBe(18000);
});

test('a true course is not passed on as the magnetic course', () => {
  const text = [leg({proc: 'TRUEE1', trans: 'RW35L', fix: 'QXONE', course: '251T'}), rwy('35L', 'N42360000', 'W095120000')].join('\n');
  const sid = airportProcedures('XAAA', text, fixes).procedures.find((x) => x.name === 'TRUEE1');
  expect(sid?.common[0]?.legs[0]).toMatchObject({fix: 'QXONE', courseDeg: null});
});

test('a leg whose fix is unknown keeps null position', () => {
  const leg2 = find('TESTT2').transitions.find((r) => r.name === 'TRANS')?.legs[1];
  expect(leg2).toMatchObject({fix: 'NOWHR', lat: null, lon: null});
  expect(find('TESTT2').transitions[0]?.legs).toHaveLength(2);
});

test('names approach type, runway and variant', () => {
  expect(find('R06LY')).toMatchObject({kind: 'approach', approachType: 'RNAV', runway: '06L', variant: 'Y'});
  const ils = find('I24R');
  expect(ils).toMatchObject({approachType: 'ILS', runway: '24R'});
  expect(ils.variant).toBeUndefined();
});

test('splits common parts from transitions', () => {
  const sid = find('TESTT2');
  expect(sid.common.map((r) => r.name).sort()).toEqual(['35L', 'ALL']);
  expect(sid.transitions.map((r) => r.name)).toEqual(['TRANS']);
  const app = find('R06LY');
  expect(app.common.map((r) => r.name)).toEqual(['']);
  expect(app.transitions.map((r) => r.name)).toEqual(['TRANS']);
  // the missed-approach leg is left out, the runway leg is kept
  expect(app.common[0]?.legs.map((l) => l.fix)).toEqual(['QXONE', 'RW06L']);
});

test('a leg whose fix is the airport ident gets the airport position, and terminal fixes are per airport', () => {
  const cifp = [
    leg({proc: 'TESTT2', trans: 'ALL', fix: 'XBBB'}),
    leg({seq: '020', proc: 'TESTT2', trans: 'ALL', fix: 'FF18'}),
  ].join('\n');
  const two = indexFixes(' 1.000000000 2.000000000  FF18 XAAA K2 4530000 FF18\n 3.000000000 4.000000000  FF18 XBBB K2 4530000 FF18\n', '');
  const legs = airportProcedures('XBBB', cifp, two, {lat: 9, lon: 8}).procedures[0]?.common[0]?.legs;
  expect(legs?.[0]).toMatchObject({lat: 9, lon: 8});
  expect(legs?.[1]).toMatchObject({lat: 3, lon: 4});
  expect(airportProcedures('XBBB', cifp, two).procedures[0]?.common[0]?.legs[0]).toMatchObject({lat: null});
});
