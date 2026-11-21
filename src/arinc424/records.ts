// ARINC 424-18 record kinds: what each section and subsection is called, where the subsection code sits,
// and for some kinds which columns name the thing a record describes (its identity), which hold the
// sequence number that renumbers, and which the continuation number.
//
// Columns are 1-based and inclusive, on the 132-column record. Every record starts the same way:
// column 1 record type (S standard, T tailored), 2–4 customer or area code, 5 section code. The area
// code is part of the identity where the same name is used again in another area (airway restrictions,
// restrictive airspace). Airport (P)
// and heliport (H) records then carry the airport or heliport at 7–10, its ICAO region at 11–12 and the
// subsection at 13; every other section has its subsection at column 6. Terminal NDBs are the exception:
// section P with N at column 6 (they share the navaid layout) and column 13 blank; `subsectionOf` knows.
//
// Sources: the public descriptions of the 424-18 record layouts (as the FAA's CIFP documentation and
// widely published readers give them), and the columns Kyōyū's own readers already use: the procedure
// legs, runways and airport records in ../faa/cifp.ts and the restrictive airspace in ../faa/airspace.ts.
// Positions were checked against real records without taking anything from them; every record in the
// tests is invented.

/** A run of columns, 1-based and inclusive. */
export interface ColumnSpan {
  readonly start: number;
  readonly end: number;
}

/**
 * One named part of a record's identity. The names are the same across layouts: `area` the customer or
 * area code (2–4), `airport` the airport ident and `airportRegion` its ICAO region (11–12), `region` the
 * record's own ICAO region (a navaid's 20–21, an airspace's 7–8).
 */
export interface IdentityField extends ColumnSpan {
  readonly name: string;
}

/** Where a record's fields are, for the kinds `recordLayout` covers. */
export interface RecordLayout {
  /** The columns that name the thing the record describes (airport, region, procedure, ident and so on). */
  readonly identity: ReadonlyArray<IdentityField>;
  /** The sequence number, which renumbers when points are added or removed. */
  readonly sequence?: ColumnSpan;
  /** The continuation record number (0 or 1 on a primary record, 2 and up on continuations). */
  readonly continuation?: ColumnSpan;
  /** Several records share this identity and form an unordered list; compare them as a set. */
  readonly grouped?: true;
}

/** The column of the subsection code: 13 for airports (P) and heliports (H), 6 for the rest. See `subsectionOf` for PN. */
export function subsectionColumn(section: string): 6 | 13 {
  return section === 'P' || section === 'H' ? 13 : 6;
}

/** A record's subsection code (a blank is `' '`), terminal NDBs included (P with N at column 6). */
export function subsectionOf(record: string): string {
  const r = record.padEnd(132);
  const section = r[4]!;
  if (section === 'P' && r[5] === 'N') return 'N';
  return r[subsectionColumn(section) - 1]!;
}

const KIND_NAMES: Readonly<Record<string, string>> = {
  // A: MORA
  AS: 'Grid MORA',
  // D: navaids
  'D ': 'VHF navaid',
  DB: 'NDB navaid',
  // E: enroute
  EA: 'Enroute waypoint',
  EM: 'Airway marker',
  EP: 'Holding pattern',
  ER: 'Airway or route',
  ES: 'Special activity area',
  ET: 'Preferred route',
  EU: 'Airway restriction',
  EV: 'Enroute communications',
  // H: heliports
  HA: 'Heliport',
  HC: 'Heliport terminal waypoint',
  HD: 'Heliport SID',
  HE: 'Heliport STAR',
  HF: 'Heliport approach procedure',
  HK: 'Heliport terminal arrival altitude (TAA)',
  HS: 'Heliport MSA',
  HV: 'Heliport communications',
  // P: airports
  PA: 'Airport',
  PB: 'Airport gate',
  PC: 'Terminal waypoint',
  PD: 'SID',
  PE: 'STAR',
  PF: 'Approach procedure',
  PG: 'Runway',
  PI: 'Localizer and glide slope',
  PK: 'Terminal arrival altitude (TAA)',
  PL: 'MLS',
  PM: 'Localizer marker',
  PN: 'Terminal NDB',
  PP: 'Path point',
  PR: 'Flight planning arrival and departure data',
  PS: 'MSA',
  PT: 'GLS reference path',
  PV: 'Airport communications',
  // R: company routes
  'R ': 'Company route',
  RA: 'Alternate record',
  // T: tables
  TC: 'Cruising table',
  TG: 'Geographical reference table',
  // U: airspace
  UC: 'Controlled airspace',
  UF: 'FIR/UIR',
  UR: 'Restrictive airspace',
};

/** The plain name of a record kind, or null when unknown. A blank subsection may be `' '` or `''`. */
export function recordKindName(section: string, subsection: string): string | null {
  return KIND_NAMES[kindKey(section, subsection)] ?? null;
}

const kindKey = (section: string, subsection: string): string => `${section}${subsection === '' ? ' ' : subsection}`;

const f = (name: string, start: number, end: number = start): IdentityField => ({name, start, end});
const s = (start: number, end: number = start): ColumnSpan => ({start, end});

function layout(identity: IdentityField[], continuation: ColumnSpan, sequence?: ColumnSpan, grouped?: 'grouped'): RecordLayout {
  return Object.freeze({
    identity: Object.freeze(identity.map((x) => Object.freeze(x))),
    continuation: Object.freeze(continuation),
    ...(sequence === undefined ? {} : {sequence: Object.freeze(sequence)}),
    ...(grouped === undefined ? {} : {grouped: true as const}),
  });
}

const AIRPORT = [f('airport', 7, 10), f('airportRegion', 11, 12)];

// SID, STAR and approach legs (../faa/cifp.ts reads the same columns): procedure 14–19, route type 20,
// transition 21–25, sequence 27–29, continuation 39. The leg's fix (30–34) is data, not identity, so a
// changed fix shows as a change in the procedure's list of legs.
const PROCEDURE = layout([...AIRPORT, f('procedure', 14, 19), f('routeType', 20), f('transition', 21, 25)], s(39), s(27, 29));

// Navaids: the airport (terminal navaids only) and its region at 7–12, the ident at 14–17, the navaid's
// own region at 20–21, continuation 22. VHF navaids (D, blank subsection), NDBs (DB) and terminal NDBs (PN).
const NAVAID = layout([...AIRPORT, f('ident', 14, 17), f('region', 20, 21)], s(22));

const LAYOUTS: Readonly<Record<string, RecordLayout>> = {
  PD: PROCEDURE,
  PE: PROCEDURE,
  PF: PROCEDURE,
  // Restrictive airspace (grouped as ../faa/airspace.ts groups it, by area code and 7–20): area 2–4,
  // region 7–8, type 9, designation 10–19, multiple code 20, sequence 21–24, continuation 25.
  UR: layout([f('area', 2, 4), f('region', 7, 8), f('type', 9), f('designation', 10, 19), f('multipleCode', 20)], s(25), s(21, 24)),
  // Controlled airspace: region 7–8, type 9, centre 10–14 with its section 15 and subsection 16,
  // classification 17 (one centre can have areas of several classes under the same multiple code),
  // multiple code 20, sequence 21–24, continuation 25.
  UC: layout([f('region', 7, 8), f('type', 9), f('centre', 10, 14), f('centreSection', 15), f('centreSubsection', 16), f('classification', 17), f('multipleCode', 20)], s(25), s(21, 24)),
  // FIR/UIR: ident 7–10, address 11–14, indicator (F, U or B) 15, sequence 16–19, continuation 20.
  UF: layout([f('ident', 7, 10), f('address', 11, 14), f('indicator', 15)], s(20), s(16, 19)),
  // Runway (../faa/cifp.ts): runway 14–18, continuation 22.
  PG: layout([...AIRPORT, f('runway', 14, 18)], s(22)),
  // Airport communications: type 14–16, continuation 26. The frequency at 17–23 is data, so several of
  // one type form a list (grouped).
  PV: layout([...AIRPORT, f('type', 14, 16)], s(26), undefined, 'grouped'),
  // Enroute communications: FIR/RDO 7–10, address 11–14, indicator 15, remote site name 19–43, type
  // 44–46, continuation 56. The frequency at 47–53 is data, so several form a list (grouped).
  EV: layout([f('ident', 7, 10), f('address', 11, 14), f('indicator', 15), f('remoteName', 19, 43), f('type', 44, 46)], s(56), undefined, 'grouped'),
  // Airport (../faa/cifp.ts reads its continuation at 22).
  PA: layout([...AIRPORT], s(22)),
  // MSA: centre 14–18 with its region 19–20, section 21 and subsection 22, multiple code 23, continuation 39.
  PS: layout([...AIRPORT, f('centre', 14, 18), f('centreRegion', 19, 20), f('centreSection', 21), f('centreSubsection', 22), f('multipleCode', 23)], s(39)),
  // Path point (SBAS/GBAS final approach segment): approach 14–19, runway 20–24, continuation 27
  // (operation type 25–26 and the rest are data).
  PP: layout([...AIRPORT, f('approach', 14, 19), f('runway', 20, 24)], s(27)),
  // Airway restriction: area 2–4 (route idents repeat between areas), route 7–11, restriction ident
  // 13–15, restriction type 16–17, continuation 18.
  EU: layout([f('area', 2, 4), f('route', 7, 11), f('restriction', 13, 15), f('restrictionType', 16, 17)], s(18)),
  'D ': NAVAID,
  DB: NAVAID,
  PN: NAVAID,
  // Localizer and glide slope: localizer 14–17, continuation 22.
  PI: layout([...AIRPORT, f('localizer', 14, 17)], s(22)),
  // Localizer marker: localizer 14–17, marker type 18–20, continuation 22. Some data sets write the
  // two-letter type one column to the right; 18–20 holds it either way.
  PM: layout([...AIRPORT, f('localizer', 14, 17), f('markerType', 18, 20)], s(22)),
  // Airway marker: ident 14–17, region 20–21, continuation 22.
  EM: layout([f('ident', 14, 17), f('region', 20, 21)], s(22)),
  // GLS reference path: reference path ident 14–17, continuation 22.
  PT: layout([...AIRPORT, f('referencePath', 14, 17)], s(22)),
};

/** Where the identity, sequence and continuation are for a record kind, or null for a kind not covered. */
export function recordLayout(section: string, subsection: string): RecordLayout | null {
  return LAYOUTS[kindKey(section, subsection)] ?? null;
}
