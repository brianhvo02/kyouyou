import {describe, expect, test} from 'vitest';
import {parseCifp} from './cifp.ts';

// Made-up lines in the column layout of X-Plane's CIFP files. Nothing here is copied from real data.
interface L {
  row?: string; seq?: string; type?: string; proc: string; trans?: string; fix?: string; region?: string;
  desc?: string; pt?: string; course?: string; altDesc?: string; alt1?: string; alt2?: string; ta?: string; speed?: string;
  turn?: string; navaid?: string; navRegion?: string; arcRadius?: string; theta?: string; rho?: string; dist?: string;
  va?: string; centre?: string; centreRegion?: string;
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
  f[9] = l.turn ?? ' ';
  f[11] = l.pt ?? 'TF';
  f[13] = l.navaid ?? ' ';
  f[14] = l.navRegion ?? ' ';
  f[17] = l.arcRadius ?? '      ';
  f[18] = l.theta ?? '    ';
  f[19] = l.rho ?? '    ';
  f[21] = l.dist ?? '    ';
  f[28] = l.va ?? '    ';
  f[30] = l.centre ?? ' ';
  f[31] = l.centreRegion ?? ' ';
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

  test('reads a true course as whole degrees and marks it true', () => {
    const l = parseCifp(leg({proc: 'TESTT2', fix: 'ABCDE', course: '085T'})).procedures[0].routes[0].legs[0];
    expect(l).toMatchObject({courseDeg: 85, courseTrue: true});
    const m = parseCifp(leg({proc: 'TESTT2', fix: 'ABCDE', course: '0710'})).procedures[0].routes[0].legs[0];
    expect(m).toMatchObject({courseDeg: 71, courseTrue: false});
  });

  test('keeps the glide slope altitude of descriptions G and H, and the intercept altitude of I and J', () => {
    const alt = (altDesc: string, alt1: string, alt2: string) =>
      parseCifp(leg({row: 'APPCH', type: 'I', proc: 'I24R', fix: 'ABCDE', altDesc, alt1, alt2})).procedures[0].routes[0].legs[0].alt;
    expect(alt('G', '03000', '02900')).toEqual({kind: 'at', ft: 3000, glideSlopeFt: 2900});
    expect(alt('H', '03000', '02900')).toEqual({kind: 'at-or-above', ft: 3000, glideSlopeFt: 2900});
    expect(alt('I', '02500', '01700')).toEqual({kind: 'at', ft: 2500, glideSlopeInterceptFt: 1700});
    expect(alt('J', '02500', '01700')).toEqual({kind: 'at-or-above', ft: 2500, glideSlopeInterceptFt: 1700});
    expect(alt('J', '02500', '     ')).toEqual({kind: 'at-or-above', ft: 2500});
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

  test('keeps routes with the same transition name but different route types apart', () => {
    const a = parseCifp([
      leg({seq: '010', type: '1', proc: 'TESTT2', trans: 'RW28L', fix: 'AAAAA'}),
      leg({seq: '010', type: '4', proc: 'TESTT2', trans: 'RW28L', fix: 'BBBBB'}),
      leg({seq: '020', type: '1', proc: 'TESTT2', trans: 'RW28L', fix: 'CCCCC'}),
    ].join('\n'));
    const routes = a.procedures[0].routes;
    expect(routes.map((r) => [r.name, r.routeType])).toEqual([['RW28L', '1'], ['RW28L', '4']]);
    expect(routes.map((r) => r.legs.map((l) => l.fix))).toEqual([['AAAAA', 'CCCCC'], ['BBBBB']]);
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

  describe('leg geometry', () => {
    const one = (l: L) => parseCifp(leg(l)).procedures[0]!.routes[0]!.legs[0]!;

    test('an RF leg gives its turn, arc centre, arc radius, arc length and vertical angle', () => {
      const g = one({row: 'APPCH', type: 'R', proc: 'R09XY', fix: 'ABCDE', pt: 'RF', turn: 'L', arcRadius: '002500', dist: '0031', va: '-300', centre: 'CTRAA', centreRegion: 'K2'});
      expect(g).toMatchObject({turnDirection: 'L', arcCentre: {ident: 'CTRAA', region: 'K2'}, arcRadiusNm: 2.5, routeDistanceNm: 3.1, holdTimeMin: null, verticalAngleDeg: -3});
    });

    test('an AF leg gives its recommended navaid, theta and rho', () => {
      const g = one({row: 'APPCH', type: 'A', proc: 'D27Z', fix: 'ARCAA', pt: 'AF', turn: 'R', navaid: 'XYZ', navRegion: 'K7', theta: '3008', rho: '0120', course: '2630'});
      expect(g).toMatchObject({turnDirection: 'R', recommendedNavaid: {ident: 'XYZ', region: 'K7'}, thetaDeg: 300.8, rhoNm: 12, courseDeg: 263});
    });

    test('a hold gives its time when written with T, else its distance', () => {
      expect(one({pt: 'HM', proc: 'P1', dist: 'T015'})).toMatchObject({holdTimeMin: 1.5, routeDistanceNm: null});
      expect(one({pt: 'HM', proc: 'P1', dist: '0040'})).toMatchObject({holdTimeMin: null, routeDistanceNm: 4});
    });

    test('the centre fix column counts as an arc centre only on RF legs', () => {
      expect(one({row: 'APPCH', type: 'R', proc: 'R09XY', fix: 'FAFFF', pt: 'TF', centre: 'RW09', centreRegion: 'K2'}).arcCentre).toBeNull();
    });

    test('a straight leg has every geometry field null', () => {
      expect(one({proc: 'P1', fix: 'AAAAA'})).toMatchObject({
        turnDirection: null, recommendedNavaid: null, arcCentre: null, arcRadiusNm: null, thetaDeg: null, rhoNm: null,
        routeDistanceNm: null, holdTimeMin: null, verticalAngleDeg: null,
      });
    });

    test('malformed geometry values read as null and the leg is kept', () => {
      const a = parseCifp(leg({proc: 'P1', fix: 'AAAAA', turn: 'X', arcRadius: '2.5', theta: '30A8', rho: '12', dist: 'TXYZ', va: '-3.0'}));
      expect(a.skipped).toEqual([]);
      expect(a.procedures[0]!.routes[0]!.legs[0]).toMatchObject({
        turnDirection: null, arcRadiusNm: null, thetaDeg: null, rhoNm: null, routeDistanceNm: null, holdTimeMin: null, verticalAngleDeg: null,
      });
    });
  });
});
