// Moved from Kansei's helper (stage-2b-voice).
import {expect, test} from 'vitest';
import {indexFixes} from './fixes.ts';

const FIX = [
  'I', '1200 Version - made up', '',
  ' 42.500000000  -95.500000000  QXTWO ENRT K2 4530000 QXTWO',
  ' 10.000000000   20.000000000  QXTWO ENRT ZZ 4530000 QXTWO',
  '99', '',
].join('\n');
const NAV = [
  'I', '1200 Version - made up', '',
  ' 3  42.731000000  -95.263000000     213   11335    130       4.000  ABC ENRT K2 ALPHA VOR/DME',
  '12  42.731000000  -95.263000000     213   11335    130       0.000  ABC ENRT K2 ALPHA VOR/DME DME',
  ' 4  42.000000000  -95.000000000     213   11015     18      82.000  IXYZ XAAA K2 08 XAAA ILS-cat-I',
  '99', '',
].join('\n');

test('finds a fix and a VOR by ident and region', () => {
  const fixes = indexFixes(FIX, NAV);
  expect(fixes.find('QXTWO', 'K2')).toEqual({lat: 42.5, lon: -95.5});
  expect(fixes.find('ABC', 'K2')).toEqual({lat: 42.731, lon: -95.263});
  expect(fixes.find('IXYZ', 'K2')).toBeNull();
  expect(fixes.find('NOPE', 'K2')).toBeNull();
});

test('the same ident in two regions are different points', () => {
  const fixes = indexFixes(FIX, NAV);
  expect(fixes.find('QXTWO', 'ZZ')).toEqual({lat: 10, lon: 20});
  expect(fixes.find('QXTWO', 'K2')).not.toEqual(fixes.find('QXTWO', 'ZZ'));
});

test('the same ident and region at two airports gives each airport its own point', () => {
  const fix = [
    ' 42.000000000  -95.000000000  FF18 XAAA K3 4530000 FF18',
    ' 43.000000000  -94.000000000  FF18 XBBB K3 4530000 FF18',
    ' 44.000000000  -93.000000000  FF18 ENRT K3 4530000 FF18',
  ].join('\n');
  const fixes = indexFixes(fix, '');
  expect(fixes.find('FF18', 'K3', 'XAAA')).toEqual({lat: 42, lon: -95});
  expect(fixes.find('FF18', 'K3', 'XBBB')).toEqual({lat: 43, lon: -94});
  expect(fixes.find('FF18', 'K3', 'XCCC')).toEqual({lat: 44, lon: -93});
  expect(fixes.find('FF18', 'K3')).toEqual({lat: 44, lon: -93});
  expect(indexFixes(fix.split('\n')[1] ?? '', '').find('FF18', 'K3', 'XAAA')).toEqual({lat: 43, lon: -94});
});
