import {describe, expect, test} from 'vitest';
import * as publicApi from './codes.ts';
import {describeAltitude, pathTerminatorName, routeTypeName, speedLimitDescription, turnDirectionName} from './codes.ts';

describe('describeAltitude', () => {
  test('the examples from the request', () => {
    expect(describeAltitude('+', '5000', '')).toBe('at or above 5,000 ft');
    expect(describeAltitude('B', 'FL120', '8000')).toBe('between FL120 and 8,000 ft');
  });

  test('at, at or above, at or below', () => {
    expect(describeAltitude(' ', '03000', '')).toBe('at 3,000 ft');
    expect(describeAltitude('', '3000', '')).toBe('at 3,000 ft');
    expect(describeAltitude('@', '3000', '')).toBe('at 3,000 ft');
    expect(describeAltitude('-', '12000', '')).toBe('at or below 12,000 ft');
    expect(describeAltitude('+', 'FL190', '')).toBe('at or above FL190');
  });

  test('C reads the second altitude', () => {
    expect(describeAltitude('C', '', '4000')).toBe('at or above 4,000 ft');
  });

  test('glide slope and intercept altitudes on the final approach fix', () => {
    expect(describeAltitude('G', '2000', '2010')).toBe('at 2,000 ft, glide slope at 2,010 ft');
    expect(describeAltitude('H', '2000', '2010')).toBe('at or above 2,000 ft, glide slope at 2,010 ft');
    expect(describeAltitude('I', '2000', '2010')).toBe('at 2,000 ft, glide slope intercept at 2,010 ft');
    expect(describeAltitude('J', '2000', '2010')).toBe('at or above 2,000 ft, glide slope intercept at 2,010 ft');
    expect(describeAltitude('G', '2000', '')).toBe('at 2,000 ft');
  });

  test('step-down fixes on a vertical path', () => {
    expect(describeAltitude('V', '1500', '1620')).toBe('at or above 1,500 ft (step-down fix; 1,620 ft on the vertical path)');
    expect(describeAltitude('X', '1500', '1620')).toBe('at 1,500 ft (step-down fix; 1,620 ft on the vertical path)');
    expect(describeAltitude('Y', '1500', '1620')).toBe('at or below 1,500 ft (step-down fix; 1,620 ft on the vertical path)');
  });

  test('between with only one altitude says so', () => {
    expect(describeAltitude('B', '9000', '')).toBe('between 9,000 ft and (none given)');
  });

  test('nothing to say when no altitude is given', () => {
    expect(describeAltitude(' ', '', '')).toBe('');
    expect(describeAltitude('+', '  ', '')).toBe('');
  });

  test('negative altitudes and odd text pass through readably', () => {
    expect(describeAltitude(' ', '-0010', '')).toBe('at -10 ft');
    expect(describeAltitude(' ', 'ABCDE', '')).toBe('at ABCDE');
  });

  test('an unknown descriptor keeps the code', () => {
    expect(describeAltitude('Q', '5000', '6000')).toBe('5,000 ft, 6,000 ft (altitude code Q)');
  });
});

describe('pathTerminatorName', () => {
  test('the example from the request', () => {
    expect(pathTerminatorName('TF')).toBe('track to fix');
  });

  test('names all 23 leg types', () => {
    const codes = ['IF', 'TF', 'CF', 'DF', 'FA', 'FC', 'FD', 'FM', 'CA', 'CD', 'CI', 'CR', 'RF', 'AF', 'VA', 'VD', 'VI', 'VM', 'VR', 'PI', 'HA', 'HF', 'HM'];
    for (const c of codes) expect.soft(pathTerminatorName(c), c).toMatch(/^[a-z]/);
    expect(new Set(codes.map(pathTerminatorName)).size).toBe(23);
    expect(pathTerminatorName('IF')).toBe('initial fix');
    expect(pathTerminatorName('RF')).toBe('constant-radius arc to fix');
    expect(pathTerminatorName('VA')).toBe('heading to altitude');
    expect(pathTerminatorName('HM')).toBe('hold to manual termination');
  });

  test('trims, and null for an unknown code', () => {
    expect(pathTerminatorName(' DF ')).toBe('direct to fix');
    expect(pathTerminatorName('ZZ')).toBeNull();
    expect(pathTerminatorName('')).toBeNull();
  });
});

describe('routeTypeName', () => {
  test('SIDs', () => {
    expect(routeTypeName('P', 'D', '1')).toBe('SID runway transition');
    expect(routeTypeName('P', 'D', '2')).toBe('SID or SID common route');
    expect(routeTypeName('P', 'D', '5')).toBe('RNAV SID or SID common route');
    expect(routeTypeName('P', 'D', '0')).toBe('engine-out SID');
    expect(routeTypeName('P', 'D', 'T')).toBe('vector SID runway transition');
  });

  test('STARs', () => {
    expect(routeTypeName('P', 'E', '1')).toBe('STAR enroute transition');
    expect(routeTypeName('P', 'E', '6')).toBe('RNAV STAR runway transition');
    expect(routeTypeName('P', 'E', '8')).toBe('profile descent common route');
  });

  test('approaches', () => {
    expect(routeTypeName('P', 'F', 'A')).toBe('approach transition');
    expect(routeTypeName('P', 'F', 'I')).toBe('ILS approach');
    expect(routeTypeName('P', 'F', 'R')).toBe('RNAV approach');
    expect(routeTypeName('P', 'F', 'H')).toBe('RNP approach');
    expect(routeTypeName('P', 'F', 'Z')).toBe('missed approach');
  });

  test('heliport procedures read like airport ones', () => {
    expect(routeTypeName('H', 'F', 'I')).toBe('ILS approach');
    expect(routeTypeName('H', 'D', '2')).toBe('SID or SID common route');
  });

  test('airways', () => {
    expect(routeTypeName('E', 'R', 'R')).toBe('RNAV airway');
    expect(routeTypeName('E', 'R', 'O')).toBe('designated airway');
  });

  test('null for an unknown code or a kind without route types', () => {
    expect(routeTypeName('P', 'F', '9')).toBeNull();
    expect(routeTypeName('P', 'G', '1')).toBeNull();
    expect(routeTypeName('P', 'D', '')).toBeNull();
  });
});

describe('turnDirectionName', () => {
  test('left, right, either', () => {
    expect(turnDirectionName('L')).toBe('left');
    expect(turnDirectionName('R')).toBe('right');
    expect(turnDirectionName('E')).toBe('either');
    expect(turnDirectionName(' ')).toBeNull();
    expect(turnDirectionName('X')).toBeNull();
  });
});

describe('speedLimitDescription', () => {
  test('at, at or above, at or below', () => {
    expect(speedLimitDescription(' ', '250')).toBe('at 250 kt');
    expect(speedLimitDescription('', '250')).toBe('at 250 kt');
    expect(speedLimitDescription('@', '210')).toBe('at 210 kt');
    expect(speedLimitDescription('+', '180')).toBe('at or above 180 kt');
    expect(speedLimitDescription('-', '230')).toBe('at or below 230 kt');
  });

  test('nothing to say without a speed', () => {
    expect(speedLimitDescription('-', '   ')).toBe('');
  });

  test('odd text passes through, an unknown descriptor keeps its code', () => {
    expect(speedLimitDescription(' ', 'ABC')).toBe('at ABC');
    expect(speedLimitDescription('Q', '200')).toBe('200 kt (speed code Q)');
  });
});

test('public API', () => {
  expect(Object.keys(publicApi).sort()).toEqual(['describeAltitude', 'pathTerminatorName', 'routeTypeName', 'speedLimitDescription', 'turnDirectionName']);
});
