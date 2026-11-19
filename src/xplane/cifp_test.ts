import {describe, expect, test} from 'vitest';
import {parseCifp} from './cifp.ts';

// Made-up lines in the column layout of X-Plane's CIFP files. Nothing here is copied from real data.
interface L {
  row?: string; seq?: string; type?: string; proc: string; trans?: string; fix?: string; region?: string;
  desc?: string; pt?: string; course?: string; altDesc?: string; alt1?: string; alt2?: string; ta?: string; speed?: string;
}
function leg(l: L): string {
  const f = new Array<string>(36).fill(' ');
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
  f[24] = l.alt2 ?? '     ';
  f[25] = l.ta ?? '     ';
  f[27] = l.speed ?? '   ';
  return `${l.row ?? 'SID'}:${f.join(',')};`;
}
const rwy = (id: string, elev: string, lat: string, lon: string): string =>
  `RWY:${id},+0000,      ,${elev}, ,IXYZ,9,   ;${lat},${lon},0000;`;

describe('parseCifp', () => {
  test('reads a SID leg with an at-or-below altitude and the transition altitude', () => {
    const a = parseCifp(leg({seq: '030', proc: 'TESTT2', trans: 'RW28L', fix: 'PORTE', pt: 'DF', altDesc: '-', alt1: '10000', ta: '18000'}));
    expect(a.procedures).toHaveLength(1);
    expect(a.procedures[0]).toMatchObject({kind: 'sid', name: 'TESTT2'});
    expect(a.procedures[0].routes[0].name).toBe('RW28L');
    expect(a.procedures[0].routes[0].legs[0]).toMatchObject({fix: 'PORTE', region: 'K2', pathTerm: 'DF', alt: {kind: 'at-or-below', ft: 10000}});
    expect(a.transitionAltitudeFt).toBe(18000);
  });

  test('reads the brief example line verbatim', () => {
    const a = parseCifp('SID:030,1,TESTT2,RW28L,PORTE,K2,P,C,E   , ,   ,DF, , , , , ,      ,    ,    ,    ,    ,-,10000,     ,18000, ,   ,    ,   , , , , , , , , ;');
    expect(a.skipped).toEqual([]);
    expect(a.procedures[0].routes[0].legs[0].alt).toEqual({kind: 'at-or-below', ft: 10000});
    expect(a.transitionAltitudeFt).toBe(18000);
  });

  test('reads flight levels and between constraints', () => {
    const a = parseCifp(leg({proc: 'TESTT2', trans: 'ALL', fix: 'ABCDE', altDesc: 'B', alt1: 'FL300', alt2: 'FL240'}));
    expect(a.procedures[0].routes[0].legs[0].alt).toEqual({kind: 'between', ft: 30000, lowerFt: 24000});
  });

  test('maps altitude descriptions to kinds', () => {
    const alt = (altDesc: string, alt1: string, alt2 = '     ') =>
      parseCifp(leg({proc: 'TESTT2', altDesc, alt1, alt2})).procedures[0].routes[0].legs[0].alt;
    expect(alt(' ', '04000')).toEqual({kind: 'at', ft: 4000});
    expect(alt('@', '04000')).toEqual({kind: 'at', ft: 4000});
    expect(alt('+', '04000')).toEqual({kind: 'at-or-above', ft: 4000});
    expect(alt('C', '02000', '05000')).toEqual({kind: 'at-or-above', ft: 5000});
    expect(alt('Y', '04000')).toEqual({kind: 'at-or-below', ft: 4000});
    expect(alt(' ', '     ')).toBeNull();
  });

  test('reads a speed limit', () => {
    const a = parseCifp(leg({proc: 'TESTT2', fix: 'ABCDE', speed: '280', course: '0710'}));
    const l = a.procedures[0].routes[0].legs[0];
    expect(l.speedKt).toBe(280);
    expect(l.courseDeg).toBe(71);
    expect(parseCifp(leg({proc: 'TESTT2'})).procedures[0].routes[0].legs[0]).toMatchObject({speedKt: null, courseDeg: null});
  });

  test('reads approach legs, including the final with a blank transition', () => {
    const a = parseCifp([
      leg({row: 'APPCH', seq: '010', type: 'A', proc: 'I24R', trans: 'MERCE', fix: 'MERCE', desc: 'EE A'}),
      leg({row: 'APPCH', seq: '010', type: 'I', proc: 'I24R', trans: ' ', fix: 'MERCE', desc: 'EE B'}),
    ].join('\n'));
    expect(a.procedures).toHaveLength(1);
    expect(a.procedures[0].kind).toBe('approach');
    expect(a.procedures[0].routes.map((r) => r.name)).toEqual(['MERCE', '']);
  });

  test('keeps legs without a fix', () => {
    const a = parseCifp([
      leg({seq: '010', proc: 'TESTT2', trans: 'RW28L', pt: 'VI', course: '2800'}),
      leg({seq: '020', proc: 'TESTT2', trans: 'RW28L', fix: 'PORTE', pt: 'DF'}),
    ].join('\n'));
    expect(a.procedures[0].routes[0].legs[0]).toMatchObject({fix: '', pathTerm: 'VI', courseDeg: 280});
  });

  test('reads runway thresholds', () => {
    const a = parseCifp(rwy('RW06L', '00113', 'N33565680', 'W118255218'));
    expect(a.runways).toHaveLength(1);
    expect(a.runways[0].ident).toBe('06L');
    expect(a.runways[0].lat).toBeCloseTo(33 + 56 / 60 + 56.8 / 3600, 6);
    expect(a.runways[0].lon).toBeCloseTo(-(118 + 25 / 60 + 52.18 / 3600), 6);
  });

  test('reads CRLF files and files with the I / Version header', () => {
    const body = [leg({proc: 'TESTT2', fix: 'PORTE'}), rwy('RW06L', '00113', 'N33565680', 'W118255218')];
    for (const text of [body.join('\r\n') + '\r\n', ['I', '1101 Version - data cycle 2501', '', ...body].join('\r\n')]) {
      const a = parseCifp(text);
      expect(a.skipped).toEqual([]);
      expect(a.procedures).toHaveLength(1);
      expect(a.runways).toHaveLength(1);
    }
  });

  test('skips a malformed row instead of throwing', () => {
    const a = parseCifp(['SID:xx,1', leg({proc: 'TESTT2', fix: 'PORTE'}), 'RWY:RW06L,garbage'].join('\n'));
    expect(a.procedures).toHaveLength(1);
    expect(a.runways).toEqual([]);
    expect(() => parseCifp('\u0000\n:::\n;;;')).not.toThrow();
  });

  test('sorts legs by sequence within a route', () => {
    const a = parseCifp([
      leg({seq: '030', proc: 'TESTT2', trans: 'RW28L', fix: 'CCCCC'}),
      leg({seq: '010', proc: 'TESTT2', trans: 'RW28L', fix: 'AAAAA'}),
      leg({seq: '020', proc: 'TESTT2', trans: 'RW28L', fix: 'BBBBB'}),
    ].join('\n'));
    expect(a.procedures[0].routes[0].legs.map((l) => l.fix)).toEqual(['AAAAA', 'BBBBB', 'CCCCC']);
  });

  test('reads descriptor roles, fly-over and the missed approach', () => {
    const ap = (seq: string, fix: string, desc: string, pt = 'TF') => leg({row: 'APPCH', seq, type: 'I', proc: 'I24R', fix, desc, pt});
    const a = parseCifp([
      ap('010', 'AAAAA', 'EE B'), ap('020', 'BBBBB', 'E  F'), ap('030', 'CCCCC', 'G  M'),
      ap('040', 'DDDDD', '  M ', 'CA'), ap('050', 'EEEEE', 'EYM '), ap('060', 'FFFFF', 'E  A'),
    ].join('\n'));
    const legs = a.procedures[0].routes[0].legs;
    expect(legs.map((l) => l.role)).toEqual(['IF', 'FAF', 'MAP', null, null, 'IAF']);
    expect(legs.map((l) => l.missed)).toEqual([false, false, false, true, true, true]);
    expect(legs.map((l) => l.flyOver)).toEqual([false, false, false, false, true, false]);
    expect(legs[0].descriptor).toBe('EE B');
  });

  test('pads a descriptor whose trailing spaces were stripped', () => {
    const a = parseCifp(leg({proc: 'TESTT2', desc: 'E'}));
    expect(a.procedures[0].routes[0].legs[0]).toMatchObject({descriptor: 'E', role: null, flyOver: false, missed: false});
  });

  test('keeps the route type', () => {
    const a = parseCifp([
      leg({row: 'APPCH', type: 'I', proc: 'I24R', trans: ' ', fix: 'AAAAA'}),
      leg({row: 'APPCH', type: 'A', proc: 'I24R', trans: 'MERCE', fix: 'MERCE'}),
    ].join('\n'));
    expect(a.procedures[0].routes.map((r) => r.routeType)).toEqual(['I', 'A']);
  });

  test('names approach type, runway and variant', () => {
    const a = parseCifp([
      leg({row: 'APPCH', type: 'R', proc: 'R06LY', fix: 'AAAAA'}),
      leg({row: 'APPCH', type: 'I', proc: 'I24R', fix: 'AAAAA'}),
      leg({row: 'APPCH', type: 'D', proc: 'D24', fix: 'AAAAA'}),
    ].join('\n'));
    expect(a.procedures[0]).toMatchObject({approachType: 'RNAV', runway: '06L', variant: 'Y'});
    expect(a.procedures[1]).toMatchObject({approachType: 'ILS', runway: '24R'});
    expect(a.procedures[1].variant).toBeUndefined();
    expect(a.procedures[2]).toMatchObject({approachType: 'other', runway: '24'});
    expect(parseCifp(leg({proc: 'TESTT2'})).procedures[0].approachType).toBeUndefined();
  });

  test('reads threshold elevation', () => {
    expect(parseCifp(rwy('RW06L', '00113', 'N33565680', 'W118255218')).runways[0].elevationFt).toBe(113);
    expect(parseCifp(rwy('RW06L', '     ', 'N33565680', 'W118255218')).runways[0].elevationFt).toBeNull();
  });

  test('no RWY rows gives runways []', () => {
    expect(parseCifp(leg({proc: 'TESTT2'})).runways).toEqual([]);
  });

  test('lists skipped rows with line and reason', () => {
    const a = parseCifp([leg({proc: 'TESTT2'}), 'SID:xx,1', 'what is this', 'PRDAT:ignored;'].join('\n'));
    expect(a.skipped).toEqual([
      {line: 2, reason: 'malformed SID row'},
      {line: 3, reason: 'no row code'},
    ]);
  });
});
