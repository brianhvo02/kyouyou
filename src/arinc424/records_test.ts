import {describe, expect, test} from 'vitest';
import * as publicApi from './records.ts';
import {recordKindName, recordLayout, subsectionColumn, subsectionOf, type RecordLayout} from './records.ts';

/** A 132-column record with the given text at the given 1-based columns; everything else blank. */
function record(fields: Record<number, string>): string {
  const r = [...' '.repeat(132)];
  for (const [at, text] of Object.entries(fields)) {
    [...text].forEach((ch, i) => (r[Number(at) - 1 + i] = ch));
  }
  return r.join('');
}

/** The identity fields of a record, by name, trimmed. */
function identity(layout: RecordLayout, r: string): Record<string, string> {
  return Object.fromEntries(layout.identity.map((f) => [f.name, r.slice(f.start - 1, f.end).trim()]));
}

const span = (r: string, s: {start: number; end: number} | undefined): string | undefined =>
  s === undefined ? undefined : r.slice(s.start - 1, s.end);

const COVERED: ReadonlyArray<[string, string]> = [
  ['P', 'D'], ['P', 'E'], ['P', 'F'], ['U', 'R'], ['U', 'C'], ['U', 'F'], ['P', 'G'], ['P', 'V'], ['E', 'V'],
  ['P', 'A'], ['P', 'S'], ['P', 'P'], ['E', 'U'], ['D', ' '], ['D', 'B'], ['P', 'I'], ['P', 'M'], ['E', 'M'],
  ['P', 'T'], ['P', 'N'],
];

describe('subsectionColumn', () => {
  test('column 13 for airports and heliports, column 6 for every other section', () => {
    expect(subsectionColumn('P')).toBe(13);
    expect(subsectionColumn('H')).toBe(13);
    for (const s of ['A', 'D', 'E', 'R', 'T', 'U']) expect(subsectionColumn(s)).toBe(6);
  });
});

describe('subsectionOf', () => {
  test('reads column 13 on airport and heliport records, column 6 on the rest', () => {
    expect(subsectionOf(record({1: 'S', 5: 'P', 7: 'XAAA', 11: 'XX', 13: 'F'}))).toBe('F');
    expect(subsectionOf(record({1: 'S', 5: 'H', 7: 'XAAA', 11: 'XX', 13: 'S'}))).toBe('S');
    expect(subsectionOf(record({1: 'S', 5: 'U', 6: 'C'}))).toBe('C');
    expect(subsectionOf(record({1: 'S', 5: 'D', 14: 'ABC'}))).toBe(' ');
  });

  test('a terminal NDB is the exception: P with N in column 6 and column 13 blank', () => {
    expect(subsectionOf(record({1: 'S', 5: 'P', 6: 'N', 7: 'XAAA', 11: 'XX', 14: 'AB'}))).toBe('N');
  });

  test('reads a short line as if padded with blanks', () => {
    expect(subsectionOf('SXXXP XAAAXXG')).toBe('G');
    expect(subsectionOf('SXXXE')).toBe(' ');
  });
});

describe('recordKindName', () => {
  test('names the examples from the request', () => {
    expect(recordKindName('U', 'C')).toBe('Controlled airspace');
    expect(recordKindName('P', 'F')).toBe('Approach procedure');
  });

  test('names every covered kind', () => {
    for (const [s, sub] of COVERED) expect.soft(recordKindName(s, sub), `${s}${sub}`).not.toBeNull();
    expect(recordKindName('D', ' ')).toBe('VHF navaid');
    expect(recordKindName('D', 'B')).toBe('NDB navaid');
    expect(recordKindName('P', 'N')).toBe('Terminal NDB');
    expect(recordKindName('P', 'T')).toBe('GLS station');
    expect(recordKindName('P', 'M')).toBe('Localizer marker');
    expect(recordKindName('E', 'M')).toBe('Airway marker');
    expect(recordKindName('U', 'R')).toBe('Restrictive airspace');
    expect(recordKindName('U', 'F')).toBe('FIR/UIR');
  });

  test('names common kinds without a layout too', () => {
    expect(recordKindName('A', 'S')).toBe('Grid MORA');
    expect(recordKindName('E', 'A')).toBe('Enroute waypoint');
    expect(recordKindName('E', 'R')).toBe('Airway or route');
    expect(recordKindName('E', 'P')).toBe('Holding pattern');
    expect(recordKindName('P', 'C')).toBe('Terminal waypoint');
    expect(recordKindName('P', 'K')).toBe('Terminal arrival altitude (TAA)');
    expect(recordKindName('H', 'F')).toBe('Heliport approach procedure');
    expect(recordKindName('R', ' ')).toBe('Company route');
    expect(recordKindName('T', 'C')).toBe('Cruising table');
  });

  test('a blank subsection may come as an empty string', () => {
    expect(recordKindName('D', '')).toBe('VHF navaid');
  });

  test('null for an unknown kind', () => {
    expect(recordKindName('P', 'Z')).toBeNull();
    expect(recordKindName('Q', ' ')).toBeNull();
  });
});

describe('recordLayout', () => {
  test('covers exactly the listed kinds', () => {
    for (const [s, sub] of COVERED) expect.soft(recordLayout(s, sub), `${s}${sub}`).not.toBeNull();
    expect(recordLayout('E', 'A')).toBeNull();
    expect(recordLayout('P', 'C')).toBeNull();
    expect(recordLayout('Q', 'Q')).toBeNull();
    expect(recordLayout('D', '')).toEqual(recordLayout('D', ' '));
  });

  test('every span is 1-based, inclusive, within columns 6 to 123, and no two overlap', () => {
    for (const [s, sub] of COVERED) {
      const l = recordLayout(s, sub)!;
      const spans = [...l.identity, ...(l.sequence ? [l.sequence] : []), ...(l.continuation ? [l.continuation] : [])];
      for (const x of spans) {
        expect.soft(x.start, `${s}${sub}`).toBeGreaterThanOrEqual(6);
        expect.soft(x.end, `${s}${sub}`).toBeLessThanOrEqual(123);
        expect.soft(x.start, `${s}${sub}`).toBeLessThanOrEqual(x.end);
      }
      const sorted = [...spans].sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) expect.soft(sorted[i]!.start, `${s}${sub} overlap`).toBeGreaterThan(sorted[i - 1]!.end);
      expect.soft(l.identity.length, `${s}${sub}`).toBeGreaterThan(0);
      expect.soft(l.continuation, `${s}${sub} continuation`).toBeDefined();
    }
  });

  test('SID, STAR and approach legs: airport, procedure, route type, transition; sequence 27–29; continuation 39', () => {
    for (const sub of ['D', 'E', 'F']) {
      const r = record({1: 'S', 2: 'XXX', 5: 'P', 7: 'XAAA', 11: 'XX', 13: sub, 14: 'ABCD1Y', 20: '5', 21: 'XBBBB', 27: '020', 30: 'XCCCC', 35: 'XX', 37: 'P', 38: 'C', 39: '1'});
      const l = recordLayout('P', sub)!;
      expect(identity(l, r)).toEqual({airport: 'XAAA', icao: 'XX', procedure: 'ABCD1Y', routeType: '5', transition: 'XBBBB'});
      expect(span(r, l.sequence)).toBe('020');
      expect(span(r, l.continuation)).toBe('1');
    }
  });

  test('restrictive airspace: region, type, designation, multiple code; sequence 21–24; continuation 25', () => {
    const r = record({1: 'S', 5: 'U', 6: 'R', 7: 'XX', 9: 'R', 10: 'XR-1234', 20: 'A', 21: '0010', 25: '1', 26: 'G'});
    const l = recordLayout('U', 'R')!;
    expect(identity(l, r)).toEqual({icao: 'XX', type: 'R', designation: 'XR-1234', multipleCode: 'A'});
    expect(span(r, l.sequence)).toBe('0010');
    expect(span(r, l.continuation)).toBe('1');
  });

  test('controlled airspace: region, type, centre and its section, multiple code; class is not identity', () => {
    const r = record({1: 'S', 5: 'U', 6: 'C', 7: 'XX', 9: 'T', 10: 'XAAA', 15: 'P', 16: 'A', 17: 'C', 20: 'B', 21: '0020', 25: '1'});
    const l = recordLayout('U', 'C')!;
    expect(identity(l, r)).toEqual({icao: 'XX', type: 'T', centre: 'XAAA', centreSection: 'P', centreSubsection: 'A', multipleCode: 'B'});
    expect(span(r, l.sequence)).toBe('0020');
    expect(span(r, l.continuation)).toBe('1');
  });

  test('FIR/UIR: ident, address, indicator; sequence 16–19; continuation 20', () => {
    const r = record({1: 'S', 5: 'U', 6: 'F', 7: 'XAAA', 11: 'XBBB', 15: 'F', 16: '0030', 20: '0', 21: 'XCCC'});
    const l = recordLayout('U', 'F')!;
    expect(identity(l, r)).toEqual({ident: 'XAAA', address: 'XBBB', indicator: 'F'});
    expect(span(r, l.sequence)).toBe('0030');
    expect(span(r, l.continuation)).toBe('0');
  });

  test('runway: airport and runway; continuation 22; no sequence', () => {
    const r = record({1: 'S', 5: 'P', 7: 'XAAA', 11: 'XX', 13: 'G', 14: 'RW09L', 22: '2'});
    const l = recordLayout('P', 'G')!;
    expect(identity(l, r)).toEqual({airport: 'XAAA', icao: 'XX', runway: 'RW09L'});
    expect(l.sequence).toBeUndefined();
    expect(span(r, l.continuation)).toBe('2');
  });

  test('airport: airport; continuation 22', () => {
    const r = record({1: 'S', 5: 'P', 7: 'XAAA', 11: 'XX', 13: 'A', 14: 'XAA', 22: '0'});
    const l = recordLayout('P', 'A')!;
    expect(identity(l, r)).toEqual({airport: 'XAAA', icao: 'XX'});
    expect(span(r, l.continuation)).toBe('0');
  });

  test('airport communications: airport and type; continuation 26', () => {
    const r = record({1: 'S', 5: 'P', 7: 'XAAA', 11: 'XX', 13: 'V', 14: 'TWR', 17: '0999990', 25: 'V', 26: '2'});
    const l = recordLayout('P', 'V')!;
    expect(identity(l, r)).toEqual({airport: 'XAAA', icao: 'XX', type: 'TWR'});
    expect(span(r, l.continuation)).toBe('2');
  });

  test('enroute communications: FIR/RDO, address, indicator, remote name, type; continuation 56', () => {
    const r = record({1: 'S', 5: 'E', 6: 'V', 7: 'XAAA', 11: 'XBBB', 15: 'U', 19: 'NOWHERE RADIO', 44: 'ACC', 47: '0999990', 55: 'V', 56: '1'});
    const l = recordLayout('E', 'V')!;
    expect(identity(l, r)).toEqual({ident: 'XAAA', address: 'XBBB', indicator: 'U', remoteName: 'NOWHERE RADIO', type: 'ACC'});
    expect(span(r, l.continuation)).toBe('1');
  });

  test('MSA: airport, centre with its region and section, multiple code; continuation 39', () => {
    const r = record({1: 'S', 5: 'P', 7: 'XAAA', 11: 'XX', 13: 'S', 14: 'XBBBB', 19: 'XX', 21: 'P', 22: 'C', 23: 'A', 39: '1'});
    const l = recordLayout('P', 'S')!;
    expect(identity(l, r)).toEqual({airport: 'XAAA', icao: 'XX', centre: 'XBBBB', centreIcao: 'XX', centreSection: 'P', centreSubsection: 'C', multipleCode: 'A'});
    expect(span(r, l.continuation)).toBe('1');
  });

  test('path point: airport, approach, runway; continuation 27', () => {
    const r = record({1: 'S', 5: 'P', 7: 'XAAA', 11: 'XX', 13: 'P', 14: 'R09L', 20: 'RW09L', 25: '00', 27: '1'});
    const l = recordLayout('P', 'P')!;
    expect(identity(l, r)).toEqual({airport: 'XAAA', icao: 'XX', approach: 'R09L', runway: 'RW09L'});
    expect(span(r, l.continuation)).toBe('1');
  });

  test('airway restriction: route, restriction ident and type; continuation 18', () => {
    const r = record({1: 'S', 5: 'E', 6: 'U', 7: 'X123', 13: '042', 16: 'AE', 18: '1', 19: 'XAAAA'});
    const l = recordLayout('E', 'U')!;
    expect(identity(l, r)).toEqual({route: 'X123', restriction: '042', restrictionType: 'AE'});
    expect(span(r, l.continuation)).toBe('1');
  });

  test('VHF navaid, NDB and terminal NDB: airport, ident, region; continuation 22', () => {
    for (const [s, sub, at6] of [['D', ' ', ' '], ['D', 'B', 'B'], ['P', 'N', 'N']] as const) {
      const r = record({1: 'S', 5: s, 6: at6, 7: 'XAAA', 11: 'XX', 14: 'ABC', 20: 'XY', 22: '1', 23: '11500'});
      const l = recordLayout(s, sub)!;
      expect(identity(l, r), `${s}${sub}`).toEqual({airport: 'XAAA', airportIcao: 'XX', ident: 'ABC', icao: 'XY'});
      expect(span(r, l.continuation)).toBe('1');
    }
  });

  test('localizer and glide slope: airport and localizer; continuation 22', () => {
    const r = record({1: 'S', 5: 'P', 7: 'XAAA', 11: 'XX', 13: 'I', 14: 'IXAA', 18: '1', 22: '0', 23: '10990'});
    const l = recordLayout('P', 'I')!;
    expect(identity(l, r)).toEqual({airport: 'XAAA', icao: 'XX', localizer: 'IXAA'});
    expect(span(r, l.continuation)).toBe('0');
  });

  test('localizer marker: airport, localizer, marker type; continuation 22', () => {
    const r = record({1: 'S', 5: 'P', 7: 'XAAA', 11: 'XX', 13: 'M', 14: 'IXAA', 18: 'OM ', 22: '0'});
    const l = recordLayout('P', 'M')!;
    expect(identity(l, r)).toEqual({airport: 'XAAA', icao: 'XX', localizer: 'IXAA', markerType: 'OM'});
    expect(span(r, l.continuation)).toBe('0');
  });

  test('airway marker: ident and region; continuation 22', () => {
    const r = record({1: 'S', 5: 'E', 6: 'M', 14: 'XM01', 20: 'XX', 22: '0'});
    const l = recordLayout('E', 'M')!;
    expect(identity(l, r)).toEqual({ident: 'XM01', icao: 'XX'});
    expect(span(r, l.continuation)).toBe('0');
  });

  test('GLS station: airport and reference path; continuation 22', () => {
    const r = record({1: 'S', 5: 'P', 7: 'XAAA', 11: 'XX', 13: 'T', 14: 'G09A', 18: '1', 22: '0', 23: '29999'});
    const l = recordLayout('P', 'T')!;
    expect(identity(l, r)).toEqual({airport: 'XAAA', icao: 'XX', referencePath: 'G09A'});
    expect(span(r, l.continuation)).toBe('0');
  });

  test('layouts are frozen', () => {
    const l = recordLayout('P', 'F')!;
    expect(Object.isFrozen(l)).toBe(true);
    expect(Object.isFrozen(l.identity)).toBe(true);
  });
});

test('public API', () => {
  expect(Object.keys(publicApi).sort()).toEqual(['recordKindName', 'recordLayout', 'subsectionColumn', 'subsectionOf']);
});
