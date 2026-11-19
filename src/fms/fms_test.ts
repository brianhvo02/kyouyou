import {describe, expect, it} from 'vitest';
import {parseFms, writeFms} from './fms.ts';
import type {FmsPlan, FmsWritePlan} from './fms.ts';

const procPlan = [
  'I', '1100 Version', 'CYCLE 2611', 'ADEP KSFO', 'DEPRWY RW28R', 'SID OFFSH9', 'SIDTRANS SADDE',
  'ADES KLAX', 'DESRWY RW25L', 'STAR SADDE6', 'STARTRANS AVE', 'NUMENR 4',
  '1 KSFO ADEP 13.000000 37.618999 -122.375000',
  '11 SADDE DRCT 0.000000 37.100000 -121.900000',
  '3 PXN V25 0.000000 36.500000 -120.100000',
  '1 KLAX ADES 128.000000 33.942501 -118.408096',
  '',
].join('\n');

const drctPlan = [
  'I', '1100 Version', 'CYCLE 2611', 'ADEP KSFO', 'ADES KLAX', 'NUMENR 3',
  '1 KSFO ADEP 13.000000 37.618999 -122.375000',
  '2 ABC DRCT 0.000000 36.000000 -120.000000',
  '1 KLAX ADES 128.000000 33.942501 -118.408096',
  '',
].join('\n');

function ok(r: ReturnType<typeof parseFms>): FmsPlan {
  if ('error' in r) throw new Error(r.error);
  return r;
}

describe('parseFms', () => {
  it('parses a plan with a named SID and STAR', () => {
    const p = ok(parseFms(procPlan));
    expect(p.origin).toBe('KSFO');
    expect(p.dest).toBe('KLAX');
    expect(p.cycle).toBe('2611');
    expect(p.sid).toEqual({name: 'OFFSH9', runway: '28R', transition: 'SADDE'});
    expect(p.star).toEqual({name: 'SADDE6', runway: '25L', transition: 'AVE'});
    expect(p.points.map((x) => x.ident)).toEqual(['KSFO', 'SADDE', 'PXN', 'KLAX']);
    expect(p.points.map((x) => x.kind)).toEqual(['airport', 'fix', 'vor', 'airport']);
    expect(p.points.map((x) => x.via)).toEqual(['ADEP', 'DRCT', 'V25', 'ADES']);
    expect(p.points[0].lat).toBeCloseTo(37.618999);
    expect(p.points[0].lon).toBeCloseTo(-122.375);
    expect(p.airports).toEqual(['KSFO', 'KLAX']);
  });

  it('parses a waypoints-mode plan (DRCT) with no procedures', () => {
    const p = ok(parseFms(drctPlan));
    expect(p.sid).toBeUndefined();
    expect(p.star).toBeUndefined();
    expect(p.points[1]).toMatchObject({ident: 'ABC', kind: 'ndb', via: 'DRCT'});
    expect(p.airports).toEqual(['KSFO', 'KLAX']);
  });

  it('tolerates CRLF, extra spaces and trailing blank lines', () => {
    const p = ok(parseFms(drctPlan.replace(/\n/g, '  \r\n') + '\r\n\r\n'));
    expect(p.points).toHaveLength(3);
  });

  it('rejects a non-.fms string', () => {
    expect('error' in parseFms('hello world')).toBe(true);
    expect('error' in parseFms('')).toBe(true);
  });

  it('rejects a NUMENR that disagrees with the line count', () => {
    expect('error' in parseFms(drctPlan.replace('NUMENR 3', 'NUMENR 5'))).toBe(true);
  });

  it('rejects a malformed waypoint line', () => {
    expect('error' in parseFms(drctPlan.replace('2 ABC DRCT 0.000000 36.000000 -120.000000', '2 ABC DRCT oops'))).toBe(true);
    expect('error' in parseFms(drctPlan.replace('36.000000', 'north'))).toBe(true);
  });

  it('ignores unknown header lines', () => {
    const withApp = procPlan.replace('NUMENR 4', 'APP I28R\nAPPTRANS XYZ\nFOO bar baz\nNUMENR 4');
    const {approach, ...rest} = ok(parseFms(withApp));
    expect(rest).toEqual(parseFms(procPlan));
    expect(approach).toBeDefined();
    expect('error' in parseFms(withApp)).toBe(false);
  });

  it('does not error on a multi-word header value', () => {
    expect('error' in parseFms(drctPlan.replace('ADEP KSFO', 'ADEP KSFO\nSID NONE X'))).toBe(false);
  });

  it('rejects structural and range problems', () => {
    expect('error' in parseFms('I\n1100 Version\nCYCLE 2611\nADEP KSFO\nADES KLAX')).toBe(true);
    expect('error' in parseFms(drctPlan.replace('NUMENR 3', 'NUMENR x'))).toBe(true);
    expect('error' in parseFms(drctPlan.replace('36.000000 -120.000000', '96.000000 -120.000000'))).toBe(true);
  });
});

describe('parseFms: altitudes, runways and the approach', () => {
  const kouroPlan = [
    'I', '1100 Version', 'CYCLE 2611', 'ADEP KSFO', 'ADES KLAX', 'NUMENR 4',
    '1 KSFO ADEP 0.000000 37.618999 -122.375000',
    '11 SADDE DRCT 35000.000000 37.100000 -121.900000',
    '3 PXN V25 35000.000000 36.500000 -120.100000',
    '1 KLAX ADES 0.000000 33.942501 -118.408096',
  ].join('\n');
  it('keeps the altitude on each point and derives the cruise altitude', () => {
    const p = ok(parseFms(kouroPlan));
    expect(p.points.map((x) => x.altitudeFt)).toEqual([0, 35000, 35000, 0]);
    expect(p.cruiseAltitudeFt).toBe(35000);
  });
  it('has no cruise altitude when every point is at zero', () => {
    expect(ok(parseFms(kouroPlan.replaceAll('35000.000000', '0.000000'))).cruiseAltitudeFt).toBeUndefined();
  });
  it('keeps a runway that has no procedure with it', () => {
    const p = ok(parseFms(kouroPlan.replace('ADEP KSFO', 'ADEP KSFO\nDEPRWY RW28R').replace('ADES KLAX', 'ADES KLAX\nDESRWY RW25L')));
    expect(p.departureRunway).toBe('28R');
    expect(p.arrivalRunway).toBe('25L');
    expect(p.sid).toBeUndefined();
    expect(p.star).toBeUndefined();
  });
  it('gives the runways beside the procedures too', () => {
    const p = ok(parseFms(procPlan));
    expect(p.departureRunway).toBe('28R');
    expect(p.arrivalRunway).toBe('25L');
  });
  it('keeps the approach and its transition, as X-Plane writes them', () => {
    const withApp = kouroPlan.replace('ADES KLAX', 'ADES KLAX\nDESRWY RW25L\nAPP I25L\nAPPTRANS CRCUS');
    expect(ok(parseFms(withApp)).approach).toEqual({name: 'I25L', transition: 'CRCUS'});
    expect(ok(parseFms(withApp.replace('APPTRANS CRCUS\n', ''))).approach).toEqual({name: 'I25L'});
    expect(ok(parseFms(kouroPlan)).approach).toBeUndefined();
  });
});

describe('writeFms', () => {
  const plan: FmsWritePlan = {
    cycle: '2611',
    origin: {ident: 'KAAA', kind: 'airport', lat: 33.6367, lon: -84.428101},
    dest: {ident: 'KDDD', kind: 'airport', lat: 41.9786, lon: -87.9048},
    sid: {name: 'SIDA1', runway: '09L', transition: 'SIDX'},
    star: {name: 'STARB2', runway: 'rw27r'},
    cruiseAltitudeFt: 35000,
    legs: [
      {ident: 'SIDA', kind: 'fix', lat: 33.8, lon: -84.2, via: 'SIDA1'},
      {ident: 'SIDX', kind: 'fix', lat: 34.1, lon: -84.9, via: 'SIDA1'},
      {ident: 'HEVAN', kind: 'fix', lat: 36.123456, lon: -85.123456, via: 'DCT'},
      {ident: 'VVV', kind: 'vor', lat: 39, lon: -86.5, via: 'J42'},
      {ident: 'NNN', kind: 'ndb', lat: 40, lon: -87, via: 'DCT'},
      {ident: 'STARB', kind: 'fix', lat: 41.5, lon: -87.6, via: 'STARB2'},
    ],
  };

  it('names the procedures and leaves their legs to the sim, when the runways are known', () => {
    expect(writeFms(plan, 'named')).toBe(
      [
        'I', '1100 Version', 'CYCLE 2611', 'ADEP KAAA', 'DEPRWY RW09L', 'SID SIDA1', 'SIDTRANS SIDX',
        'ADES KDDD', 'DESRWY RW27R', 'STAR STARB2', 'NUMENR 5',
        '1 KAAA ADEP 0.000000 33.636700 -84.428101',
        '11 HEVAN DRCT 35000.000000 36.123456 -85.123456',
        '3 VVV J42 35000.000000 39.000000 -86.500000',
        '2 NNN DRCT 35000.000000 40.000000 -87.000000',
        '1 KDDD ADES 0.000000 41.978600 -87.904800',
        '',
      ].join('\n'),
    );
  });
  it('writes a leg altitude when the leg has one, and the cruise altitude otherwise', () => {
    const withAlts: FmsWritePlan = {
      ...plan, sid: undefined, star: undefined,
      legs: [
        {ident: 'HEVAN', kind: 'fix', lat: 36.123456, lon: -85.123456, via: 'DCT', altitudeFt: 12000},
        {ident: 'VVV', kind: 'vor', lat: 39, lon: -86.5, via: 'J42'},
        {ident: 'NNN', kind: 'ndb', lat: 40, lon: -87, via: 'DCT', altitudeFt: 37000},
      ],
    };
    const text = writeFms(withAlts, 'waypoints');
    expect(text).toContain('11 HEVAN DRCT 12000.000000 36.123456 -85.123456\n');
    expect(text).toContain('3 VVV J42 35000.000000 39.000000 -86.500000\n');
    expect(text).toContain('2 NNN DRCT 37000.000000 40.000000 -87.000000\n');
    const back = parseFms(text);
    expect('error' in back ? back : back.cruiseAltitudeFt).toBe(37000);
  });

  it('writes a procedure without a runway as direct waypoints, with no header for it', () => {
    const text = writeFms({...plan, sid: {name: 'SIDA1'}}, 'named');
    expect(text).not.toContain('SID SIDA1');
    expect(text).not.toContain('DEPRWY');
    expect(text).toContain('11 SIDA DRCT 35000.000000');
    expect(text).toContain('11 SIDX DRCT 35000.000000');
    expect(text).toContain('STAR STARB2');
    expect(text).toContain('NUMENR 7');
  });
  it('lists every leg in waypoints mode, the procedures as direct', () => {
    const text = writeFms(plan, 'waypoints');
    expect(text).not.toMatch(/^(SID|STAR|DEPRWY|DESRWY) /m);
    expect(text).toContain('NUMENR 8');
    expect(text).toContain('11 STARB DRCT 35000.000000');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('writes the approach after the STAR, as X-Plane does, in named mode', () => {
    const text = writeFms({...plan, approach: {name: 'I27R', transition: 'STARB'}}, 'named');
    expect(text).toContain(['ADES KDDD', 'DESRWY RW27R', 'STAR STARB2', 'APP I27R', 'APPTRANS STARB', 'NUMENR 5', ''].join('\n'));
    expect(writeFms({...plan, approach: {name: 'I27R'}}, 'named')).toContain('STAR STARB2\nAPP I27R\nNUMENR 5\n');
  });
  it('writes DESRWY for the approach when there is no STAR block', () => {
    const noStar = {...plan, star: undefined, approach: {name: 'I24R', transition: 'CRCUS'}, arrivalRunway: '24R'};
    const text = writeFms(noStar, 'named');
    expect(text).toContain(['ADES KDDD', 'DESRWY RW24R', 'APP I24R', 'APPTRANS CRCUS', 'NUMENR 6', ''].join('\n'));
    const back = ok(parseFms(text));
    expect(back.arrivalRunway).toBe('24R');
    expect(back.approach).toEqual({name: 'I24R', transition: 'CRCUS'});
    const noRwyStar = {...noStar, star: {name: 'STARB2'}};
    expect(writeFms(noRwyStar, 'named')).toContain('ADES KDDD\nDESRWY RW24R\nAPP I24R\n');
  });
  it('writes DESRWY once when the STAR block already has it', () => {
    const text = writeFms({...plan, star: {name: 'STARB2', runway: '25L'}, approach: {name: 'I25L'}, arrivalRunway: '25L'}, 'named');
    expect(text.match(/^DESRWY /gm)).toHaveLength(1);
    expect(text).toContain('ADES KDDD\nDESRWY RW25L\nSTAR STARB2\nAPP I25L\n');
    expect(writeFms({...plan, approach: {name: 'I25L'}, arrivalRunway: '25L'}, 'named')).toContain('DESRWY RW27R\nSTAR');
  });
  it('leaves APP out when the approach has no runway anywhere', () => {
    const text = writeFms({...plan, star: undefined, approach: {name: 'I27R', transition: 'STARB'}}, 'named');
    expect(text).not.toMatch(/^(APP|APPTRANS|DESRWY)/m);
  });
  it('writes neither DESRWY nor APP in waypoints mode', () => {
    const text = writeFms({...plan, star: undefined, approach: {name: 'I24R'}, arrivalRunway: '24R'}, 'waypoints');
    expect(text).not.toMatch(/^(APP|DESRWY)/m);
  });
  it('leaves the approach out in waypoints mode', () => {
    expect(writeFms({...plan, approach: {name: 'I27R', transition: 'STARB'}}, 'waypoints')).not.toMatch(/^APP/m);
  });
  it('reads back the approach it wrote', () => {
    expect(ok(parseFms(writeFms({...plan, approach: {name: 'I27R', transition: 'STARB'}}, 'named'))).approach).toEqual({name: 'I27R', transition: 'STARB'});
    expect(ok(parseFms(writeFms({...plan, approach: {name: 'I27R'}}, 'named'))).approach).toEqual({name: 'I27R'});
    expect(ok(parseFms(writeFms(plan, 'named'))).approach).toBeUndefined();
  });

  it('reads back what it wrote, in both modes', () => {
    const named = ok(parseFms(writeFms(plan, 'named')));
    expect(named).toMatchObject({
      origin: 'KAAA',
      dest: 'KDDD',
      cycle: '2611',
      departureRunway: '09L',
      arrivalRunway: '27R',
      sid: {name: 'SIDA1', runway: '09L', transition: 'SIDX'},
      star: {name: 'STARB2', runway: '27R'},
      cruiseAltitudeFt: 35000,
      airports: ['KAAA', 'KDDD'],
    });
    expect(named.points.map((p) => `${p.ident} ${p.kind} ${p.via} ${p.altitudeFt}`)).toEqual(['KAAA airport ADEP 0', 'HEVAN fix DRCT 35000', 'VVV vor J42 35000', 'NNN ndb DRCT 35000', 'KDDD airport ADES 0']);
    const all = ok(parseFms(writeFms(plan, 'waypoints')));
    expect(all.sid).toBeUndefined();
    expect(all.points.map((p) => p.ident)).toEqual(['KAAA', 'SIDA', 'SIDX', 'HEVAN', 'VVV', 'NNN', 'STARB', 'KDDD']);
    // Positions survive to the six decimals the format carries.
    for (const [i, leg] of plan.legs.entries()) {
      expect(all.points[i + 1]!.lat).toBeCloseTo(leg.lat, 6);
      expect(all.points[i + 1]!.lon).toBeCloseTo(leg.lon, 6);
    }
  });
});
