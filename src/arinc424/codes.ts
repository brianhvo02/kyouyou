// ARINC 424-18 codes in plain words: altitude and speed limits, path terminators, route types and turn
// directions, as found in SID, STAR and approach legs and in airway records. The meanings follow the
// public descriptions of the 424 format (as the FAA's CIFP documentation gives them) and the reading
// already in ./procedures.ts; the wording is kyouyou's own.

import {parseFeet} from './procedures.ts';

/** An altitude as written, for reading: `5000` is "5,000 ft", `FL120` stays "FL120", anything else as is. */
function altitude(s: string): string {
  const t = s.trim();
  if (/^FL\d+$/.test(t)) return t;
  const ft = parseFeet(t);
  return ft === null ? t : `${ft.toLocaleString('en-US')} ft`;
}

/**
 * An altitude limit in words, from the altitude description and the two altitude fields of a leg:
 * `('+', '5000', '')` is "at or above 5,000 ft", `('B', 'FL120', '8000')` "between FL120 and 8,000 ft".
 * Empty when no altitude is given. An unknown descriptor keeps its code.
 */
export function describeAltitude(descriptor: string, alt1: string, alt2: string): string {
  const d = descriptor.trim();
  const a = alt1.trim() === '' ? '' : altitude(alt1);
  const b = alt2.trim() === '' ? '' : altitude(alt2);
  if (a === '' && b === '') return '';
  // G to J: the first altitude is the fix's limit, the second the glide slope (or its intercept) there.
  // Either may be blank; a blank first altitude leaves only the second.
  const then = (first: string, second: string): string => {
    if (a === '') return `${second} ${b}`;
    return b === '' ? `${first} ${a}` : `${first} ${a}, ${second} ${b}`;
  };
  // V, X and Y mark a step-down fix on a coded vertical angle: the first altitude is the fix's limit, the
  // second the altitude of the vertical path there.
  const stepDown = (words: string): string => {
    if (a === '') return `${b} on the vertical path (step-down fix)`;
    return b === '' ? `${words} ${a}` : `${words} ${a} (step-down fix; ${b} on the vertical path)`;
  };
  switch (d) {
    case '': case '@': return `at ${a || b}`;
    case '+': return `at or above ${a || b}`;
    case '-': return `at or below ${a || b}`;
    case 'B': return `between ${a || '(none given)'} and ${b || '(none given)'}`;
    case 'C': return `at or above ${b || a}`;
    case 'G': return then('at', 'glide slope at');
    case 'H': return then('at or above', 'glide slope at');
    case 'I': return then('at', 'glide slope intercept at');
    case 'J': return then('at or above', 'glide slope intercept at');
    case 'V': return stepDown('at or above');
    case 'X': return stepDown('at');
    case 'Y': return stepDown('at or below');
    default: return `${[a, b].filter((x) => x !== '').join(', ')} (altitude code ${d})`;
  }
}

const PATH_TERMINATORS: Readonly<Record<string, string>> = {
  IF: 'initial fix',
  TF: 'track to fix',
  CF: 'course to fix',
  DF: 'direct to fix',
  FA: 'course from fix to altitude',
  FC: 'course from fix for a distance',
  FD: 'course from fix to DME distance',
  FM: 'course from fix to manual termination',
  CA: 'course to altitude',
  CD: 'course to DME distance',
  CI: 'course to intercept',
  CR: 'course to radial',
  RF: 'constant-radius arc to fix',
  AF: 'arc to fix (DME arc)',
  VA: 'heading to altitude',
  VD: 'heading to DME distance',
  VI: 'heading to intercept',
  VM: 'heading to manual termination',
  VR: 'heading to radial',
  PI: 'procedure turn',
  HA: 'hold to altitude',
  HF: 'hold to fix (one circuit)',
  HM: 'hold to manual termination',
};

/** A path terminator (leg type) in words: `TF` is "track to fix". Null for an unknown code. */
export function pathTerminatorName(code: string): string | null {
  return PATH_TERMINATORS[code.trim()] ?? null;
}

const SID_ROUTES: Readonly<Record<string, string>> = {
  '0': 'engine-out SID',
  '1': 'SID runway transition',
  '2': 'SID or SID common route',
  '3': 'SID enroute transition',
  '4': 'RNAV SID runway transition',
  '5': 'RNAV SID or SID common route',
  '6': 'RNAV SID enroute transition',
  F: 'FMS SID runway transition',
  M: 'FMS SID or SID common route',
  S: 'FMS SID enroute transition',
  T: 'vector SID runway transition',
  V: 'vector SID enroute transition',
};

const STAR_ROUTES: Readonly<Record<string, string>> = {
  '1': 'STAR enroute transition',
  '2': 'STAR or STAR common route',
  '3': 'STAR runway transition',
  '4': 'RNAV STAR enroute transition',
  '5': 'RNAV STAR or STAR common route',
  '6': 'RNAV STAR runway transition',
  '7': 'profile descent enroute transition',
  '8': 'profile descent common route',
  '9': 'profile descent runway transition',
  F: 'FMS STAR enroute transition',
  M: 'FMS STAR or STAR common route',
  S: 'FMS STAR runway transition',
};

const APPROACH_ROUTES: Readonly<Record<string, string>> = {
  A: 'approach transition',
  B: 'localizer back course approach',
  D: 'VOR/DME approach',
  F: 'FMS approach',
  G: 'IGS approach',
  H: 'RNP approach',
  I: 'ILS approach',
  J: 'GLS approach',
  L: 'localizer approach',
  M: 'MLS approach',
  N: 'NDB approach',
  P: 'GPS approach',
  Q: 'NDB/DME approach',
  R: 'RNAV approach',
  S: 'VOR approach using a VOR/DME or VORTAC',
  T: 'TACAN approach',
  U: 'SDF approach',
  V: 'VOR approach',
  W: 'MLS type A approach',
  X: 'LDA approach',
  Y: 'MLS type B and C approach',
  Z: 'missed approach',
};

const AIRWAY_ROUTES: Readonly<Record<string, string>> = {
  A: 'airline airway',
  C: 'control airway',
  D: 'direct route',
  H: 'helicopter airway',
  O: 'designated airway',
  R: 'RNAV airway',
  S: 'undesignated ATS route',
};

const ROUTE_TYPES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  PD: SID_ROUTES,
  HD: SID_ROUTES,
  PE: STAR_ROUTES,
  HE: STAR_ROUTES,
  PF: APPROACH_ROUTES,
  HF: APPROACH_ROUTES,
  ER: AIRWAY_ROUTES,
};

/**
 * A route type in words, for SIDs, STARs and approaches (airport or heliport) and airways:
 * `('P', 'F', 'I')` is "ILS approach". Null for an unknown code or a kind without route types.
 */
export function routeTypeName(section: string, subsection: string, code: string): string | null {
  return ROUTE_TYPES[`${section}${subsection}`]?.[code.trim()] ?? null;
}

const TURNS: Readonly<Record<string, string>> = {L: 'left', R: 'right', E: 'either'};

/** A turn direction in words: L "left", R "right", E "either". Null for anything else. */
export function turnDirectionName(code: string): string | null {
  return TURNS[code.trim()] ?? null;
}

/**
 * A speed limit in words: `('-', '230')` is "at or below 230 kt". Empty without a speed. An unknown
 * descriptor keeps its code.
 */
export function speedLimitDescription(descriptor: string, speed: string): string {
  const t = speed.trim();
  if (t === '') return '';
  const kt = /^\d+$/.test(t) ? `${Number(t)} kt` : t;
  switch (descriptor.trim()) {
    case '': case '@': return `at ${kt}`;
    case '+': return `at or above ${kt}`;
    case '-': return `at or below ${kt}`;
    default: return `${kt} (speed code ${descriptor.trim()})`;
  }
}
