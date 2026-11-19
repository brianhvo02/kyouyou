import {describe, expect, test} from 'vitest';
import {parseFaaCifp} from './cifp.ts';
import {parseCifp} from '../xplane/cifp.ts';

// Made-up records in the 132-column ARINC 424-18 layout of FAACIFP18, built by placing each field at its
// 1-based column. Nothing here is copied from the FAA's file.
function record(fields: Readonly<Record<number, string>>): string {
  const cols = new Array<string>(132).fill(' ');
  for (const [col, value] of Object.entries(fields)) {
    for (let i = 0; i < value.length; i++) cols[Number(col) - 1 + i] = value[i]!;
  }
  return cols.join('');
}

interface Leg {
  airport?: string; sub?: 'D' | 'E' | 'F'; proc: string; type?: string; trans?: string; seq?: string; fix?: string; region?: string;
  cont?: string; desc?: string; pt?: string; course?: string; altDesc?: string; alt1?: string; alt2?: string; ta?: string; speed?: string;
}
const leg = (l: Leg): string =>
  record({
    1: 'S', 2: 'USA', 5: 'P', 7: l.airport ?? 'KTST', 11: 'K2', 13: l.sub ?? 'D',
    14: l.proc, 20: l.type ?? '1', 21: l.trans ?? '', 27: l.seq ?? '010', 30: l.fix ?? '', 35: l.region ?? 'K2',
    39: l.cont ?? '0', 40: l.desc ?? 'E   ', 48: l.pt ?? 'TF', 71: l.course ?? '', 83: l.altDesc ?? ' ',
    85: l.alt1 ?? '', 90: l.alt2 ?? '', 95: l.ta ?? '', 100: l.speed ?? '', 124: '12345', 129: '2611',
  });
const runway = (id: string, lat: string, lon: string, elev: string, airport = 'KTST'): string =>
  record({1: 'S', 2: 'USA', 5: 'P', 7: airport, 11: 'K2', 13: 'G', 14: id, 22: '0', 23: '09000', 28: '0710', 33: lat, 42: lon, 67: elev});

const parse = (lines: string[]) => parseFaaCifp(lines);
const only = (lines: string[]) => {
  const r = parse(lines);
  const a = r.airports.get('KTST');
  if (a === undefined) throw new Error('no KTST');
  return a;
};

describe('parseFaaCifp', () => {
  test('the record helper places fields at their columns', () => {
    const r = leg({proc: 'TESTT2', trans: 'RW28L', seq: '030', fix: 'PORTE', pt: 'DF'});
    expect(r).toHaveLength(132);
    expect(r.slice(0, 13)).toBe('SUSAP KTSTK2D');
    expect(r.slice(13, 19)).toBe('TESTT2');
    expect(r.slice(26, 34)).toBe('030PORTE');
    expect(r.slice(47, 49)).toBe('DF');
  });

  test('reads a SID leg with an at-or-below altitude and the transition altitude', () => {
    const a = only([leg({seq: '030', proc: 'TESTT2', trans: 'RW28L', fix: 'PORTE', pt: 'DF', altDesc: '-', alt1: '10000', ta: '18000', course: '2805'})]);
    expect(a.skipped).toEqual([]);
    expect(a.procedures).toHaveLength(1);
    expect(a.procedures[0]).toMatchObject({kind: 'sid', name: 'TESTT2'});
    expect(a.procedures[0]!.routes[0]).toMatchObject({name: 'RW28L', routeType: '1'});
    expect(a.procedures[0]!.routes[0]!.legs[0]).toEqual({
      seq: 30, fix: 'PORTE', region: 'K2', pathTerm: 'DF', alt: {kind: 'at-or-below', ft: 10000}, speedKt: null,
      courseDeg: 280.5, descriptor: 'E   ', role: null, flyOver: false, missed: false,
    });
    expect(a.transitionAltitudeFt).toBe(18000);
  });

  test('reads a STAR leg between flight levels with a speed limit', () => {
    const a = only([leg({sub: 'E', type: '2', proc: 'STARB2', trans: 'ALL', fix: 'ABCDE', altDesc: 'B', alt1: 'FL300', alt2: 'FL240', speed: '280'})]);
    expect(a.procedures[0]).toMatchObject({kind: 'star', name: 'STARB2'});
    expect(a.procedures[0]!.approachType).toBeUndefined();
    expect(a.procedures[0]!.routes[0]!.legs[0]).toMatchObject({alt: {kind: 'between', ft: 30000, lowerFt: 24000}, speedKt: 280});
  });

  test('reads an approach transition and final with fix roles, fly-over and the missed approach', () => {
    const ap = (seq: string, fix: string, desc: string, pt = 'TF', cont = '0') =>
      leg({sub: 'F', type: 'I', proc: 'I24R', seq, fix, desc, pt, cont});
    const a = only([
      leg({sub: 'F', type: 'A', proc: 'I24R', trans: 'MERCE', seq: '010', fix: 'MERCE', desc: 'EE A', pt: 'IF'}),
      leg({sub: 'F', type: 'A', proc: 'I24R', trans: 'MERCE', seq: '020', fix: 'AAAAA', desc: 'EE B'}),
      ap('010', 'AAAAA', 'EE B', 'IF'), ap('020', 'BBBBB', 'E  F', 'TF', '1'),
      // A continuation record of the leg above (application type W): no leg of its own.
      record({1: 'S', 2: 'USA', 5: 'P', 7: 'KTST', 11: 'K2', 13: 'F', 14: 'I24R', 20: 'I', 27: '020', 30: 'BBBBB', 35: 'K2', 39: '2', 40: 'W'}),
      ap('030', 'RW24R', 'G  M'), ap('040', '', '  M ', 'CA'), ap('050', 'EEEEE', 'EYM '), ap('060', 'FFFFF', 'E  A', 'HM'),
    ]);
    expect(a.skipped).toEqual([]);
    const p = a.procedures[0]!;
    expect(p).toMatchObject({kind: 'approach', name: 'I24R', approachType: 'ILS', runway: '24R'});
    expect(p.routes.map((r) => [r.routeType, r.name])).toEqual([['A', 'MERCE'], ['I', '']]);
    expect(p.routes[0]!.legs.map((l) => l.role)).toEqual(['IAF', 'IF']);
    const fin = p.routes[1]!.legs;
    expect(fin.map((l) => l.fix)).toEqual(['AAAAA', 'BBBBB', 'RW24R', '', 'EEEEE', 'FFFFF']);
    expect(fin.map((l) => l.role)).toEqual(['IF', 'FAF', 'MAP', null, null, 'IAF']);
    expect(fin.map((l) => l.missed)).toEqual([false, false, false, true, true, true]);
    expect(fin.map((l) => l.flyOver)).toEqual([false, false, false, false, true, false]);
  });

  test('names approach type, runway and variant from the procedure id', () => {
    const a = only([
      leg({sub: 'F', type: 'R', proc: 'R06LY', fix: 'AAAAA'}),
      leg({sub: 'F', type: 'H', proc: 'H06LZ', fix: 'AAAAA'}),
      leg({sub: 'F', type: 'V', proc: 'VDM-A', fix: 'AAAAA'}),
    ]);
    expect(a.procedures[0]).toMatchObject({approachType: 'RNAV', runway: '06L', variant: 'Y'});
    expect(a.procedures[1]).toMatchObject({approachType: 'RNP', runway: '06L', variant: 'Z'});
    expect(a.procedures[2]).toMatchObject({approachType: 'other'});
    expect(a.procedures[2]!.runway).toBeUndefined();
  });

  test('reads a runway threshold and its elevation', () => {
    const a = only([runway('RW06L', 'N33565680', 'W118255218', '00113'), runway('RW24R', 'S33565680', 'E118255218', '')]);
    expect(a.runways).toHaveLength(2);
    expect(a.runways[0]!.ident).toBe('06L');
    expect(a.runways[0]!.lat).toBeCloseTo(33 + 56 / 60 + 56.8 / 3600, 6);
    expect(a.runways[0]!.lon).toBeCloseTo(-(118 + 25 / 60 + 52.18 / 3600), 6);
    expect(a.runways[0]!.elevationFt).toBe(113);
    expect(a.runways[1]).toMatchObject({ident: '24R', elevationFt: null});
    expect(a.runways[1]!.lat).toBeLessThan(0);
    expect(a.runways[1]!.lon).toBeGreaterThan(0);
  });

  test('puts records for two airports in two entries', () => {
    const r = parse([
      leg({airport: 'KAAA', proc: 'AAAA1', fix: 'AAAAA'}),
      runway('RW09', 'N33565680', 'W118255218', '00010', 'KBBB'),
      leg({airport: 'KBBB', proc: 'BBBB1', fix: 'BBBBB', ta: '18000'}),
      leg({airport: 'KAAA', proc: 'AAAA1', seq: '020', fix: 'CCCCC'}),
    ]);
    expect([...r.airports.keys()]).toEqual(['KAAA', 'KBBB']);
    expect(r.airports.get('KAAA')!.procedures[0]!.routes[0]!.legs.map((l) => l.fix)).toEqual(['AAAAA', 'CCCCC']);
    expect(r.airports.get('KAAA')!.runways).toEqual([]);
    expect(r.airports.get('KAAA')!.transitionAltitudeFt).toBeNull();
    expect(r.airports.get('KBBB')!.runways).toHaveLength(1);
    expect(r.airports.get('KBBB')!.transitionAltitudeFt).toBe(18000);
  });

  test('skips a malformed record with its line number, and never throws', () => {
    const r = parse([
      'HDR01 header line',
      leg({proc: 'TESTT2', fix: 'PORTE'}),
      leg({proc: 'TESTT2', seq: 'x1', fix: 'BADSQ'}),
      leg({proc: '', fix: 'NONAM'}),
      runway('RW06L', 'N3356', 'W118255218', '00113'),
      leg({airport: '', proc: 'TESTT2', fix: 'NOAPT'}),
      leg({proc: 'TESTT2', cont: 'x', fix: 'BADCN'}),
    ]);
    const a = r.airports.get('KTST')!;
    expect(a.procedures[0]!.routes[0]!.legs.map((l) => l.fix)).toEqual(['PORTE']);
    expect(a.runways).toEqual([]);
    expect(a.skipped).toEqual([
      {line: 3, reason: 'malformed SID record'},
      {line: 4, reason: 'malformed SID record'},
      {line: 5, reason: 'runway record without a readable runway or threshold position'},
      {line: 7, reason: 'malformed SID record'},
    ]);
    expect(r.skipped).toEqual([{line: 6, reason: 'airport record without an airport id'}]);
    expect(() => parseFaaCifp(['\u0000', 'S', 'SUSAP', '', 'x'.repeat(500)])).not.toThrow();
  });

  test('ignores other sections silently', () => {
    const r = parse([
      record({1: 'S', 2: 'USA', 5: 'E', 6: 'A', 14: 'ABCDE', 20: 'K2'}),
      record({1: 'S', 2: 'USA', 5: 'H', 7: 'KTST', 11: 'K2', 13: 'D', 14: 'TESTT2'}),
      record({1: 'S', 2: 'USA', 5: 'P', 6: 'N', 7: 'KTST', 11: 'K2', 13: 'D', 14: 'TESTT2'}),
      record({1: 'S', 2: 'USA', 5: 'P', 7: 'KTST', 11: 'K2', 13: 'A', 14: 'TST'}),
      record({1: 'S', 2: 'USA', 5: 'P', 7: 'KTST', 11: 'K2', 13: 'C', 14: 'ABCDE'}),
    ]);
    expect(r.skipped).toEqual([]);
    expect(r.airports.size).toBe(0);
  });

  test('reads lines with a trailing CR or trailing spaces trimmed, and takes any iterable', () => {
    const text = [leg({proc: 'TESTT2', fix: 'PORTE'}), runway('RW06L', 'N33565680', 'W118255218', '00113').trimEnd()].join('\r\n');
    function* lines(): Generator<string> {
      yield* text.split('\n');
    }
    const a = parseFaaCifp(lines()).airports.get('KTST')!;
    expect(a.skipped).toEqual([]);
    expect(a.procedures).toHaveLength(1);
    expect(a.runways).toHaveLength(1);
  });

  test('gives the same airport as parseCifp reads from the equivalent X-Plane lines', () => {
    // One small approach with a transition, a final, a missed approach, and a runway.
    const xp = (seq: string, type: string, trans: string, fix: string, desc: string, pt: string, course: string, altDesc: string, alt1: string, alt2: string, ta: string, speed: string): string => {
      const f = new Array<string>(36).fill(' ');
      Object.assign(f, {0: seq, 1: type, 2: 'R24RZ', 3: trans, 4: fix, 5: fix === '' ? ' ' : 'K2', 6: 'P', 7: 'C', 8: desc, 11: pt, 20: course, 22: altDesc, 23: alt1, 24: alt2, 25: ta, 27: speed});
      return `APPCH:${f.join(',')};`;
    };
    const faa = (seq: string, type: string, trans: string, fix: string, desc: string, pt: string, course: string, altDesc: string, alt1: string, alt2: string, ta: string, speed: string): string =>
      leg({sub: 'F', proc: 'R24RZ', seq, type, trans, fix, region: fix === '' ? '' : 'K2', desc, pt, course, altDesc, alt1, alt2, ta, speed});
    const rows: [string, string, string, string, string, string, string, string, string, string, string, string][] = [
      ['010', 'A', 'MERCE', 'MERCE', 'E  A', 'IF', '    ', ' ', '06000', '     ', '18000', '210'],
      ['020', 'A', 'MERCE', 'AAAAA', 'E   ', 'TF', '    ', '+', '05000', '     ', '     ', '   '],
      ['010', 'R', '', 'AAAAA', 'E  B', 'IF', '    ', '+', '05000', '     ', '18000', '   '],
      ['020', 'R', '', 'BBBBB', 'E  F', 'TF', '    ', 'B', '04000', '03000', '     ', '   '],
      ['030', 'R', '', 'RW24R', 'GY M', 'TF', '    ', ' ', '00140', '     ', '     ', '   '],
      ['040', 'R', '', '', '  M ', 'CA', '2450', ' ', '00800', '     ', '     ', '   '],
      ['050', 'R', '', 'CCCCC', 'E  H', 'DF', '    ', '+', '03000', '     ', '     ', '   '],
    ];
    const fromXp = parseCifp([...rows.map((r) => xp(...r)), `RWY:RW24R,+0000,      ,00113, ,IXYZ,9,   ;N33565680,W118255218,0000;`].join('\n'));
    const fromFaa = parseFaaCifp([...rows.map((r) => faa(...r)), runway('RW24R', 'N33565680', 'W118255218', '00113')]);
    expect(fromXp.skipped).toEqual([]);
    expect(fromFaa.skipped).toEqual([]);
    expect(fromFaa.airports.get('KTST')).toEqual(fromXp);
  });
});
