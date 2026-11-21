// Moved from Kansei's helper (stage-2b-voice).
import {expect, test} from 'vitest';
import {indexFixes} from './fixes.ts';
import {msaFor} from './msa.ts';

const NAV = ' 3  41.250000000  -96.750000000      850   11290    130       5.000  XYZ ENRT K2 XRAY VOR/DME\n';
const fixes = indexFixes('', NAV);
const AIRPORT = {lat: 41.26, lon: -96.72};
const MSA = [
  'I', '1150 Version - made up', '',
  ' 3   XYZ K2 XAAA M 090 035 25 200 048 25 300 061 25 000 000  0',
  ' 1  XAAA K2 XAAA M 270 063 25 000 000  0',
  ' 1  XDDD K2 XDDD M 180 099 25 000 000  0',
  '99', '',
].join('\n');

test('reads three sectors and stops at 000 000', () => {
  const [first] = msaFor('XAAA', MSA, fixes, AIRPORT);
  expect(first).toEqual({
    centre: 'XYZ', lat: 41.25, lon: -96.75, magnetic: true,
    sectors: [{fromDeg: 90, ft: 3500, radiusNm: 25}, {fromDeg: 200, ft: 4800, radiusNm: 25}, {fromDeg: 300, ft: 6100, radiusNm: 25}],
  });
  expect(msaFor('XAAA', MSA, fixes, AIRPORT)).toHaveLength(2);
});

test('places an airport-centred MSA at the airport', () => {
  const found = msaFor('XAAA', MSA, fixes, AIRPORT);
  expect(found[1]).toMatchObject({centre: 'XAAA', lat: 41.26, lon: -96.72, sectors: [{fromDeg: 270, ft: 6300, radiusNm: 25}]});
  expect(msaFor('XNONE', MSA, fixes, AIRPORT)).toEqual([]);
});

test('places a runway-centred MSA at the runway threshold, else at the airport', () => {
  const text = '10 RW35L K2 XAAA M 180 051 25 000 000  0\n10 RW17R K2 XAAA M 180 042 25 000 000  0\n';
  const found = msaFor('XAAA', text, fixes, AIRPORT, [{name: '35L', lat: 1.5, lon: 2.5}]);
  expect(found[0]).toMatchObject({centre: 'RW35L', lat: 1.5, lon: 2.5, sectors: [{fromDeg: 180, ft: 5100, radiusNm: 25}]});
  expect(found[1]).toMatchObject({centre: 'RW17R', ...AIRPORT});
});

test('a terminal-fix centre is looked up for its own airport', () => {
  const f = indexFixes(' 1.000000000 2.000000000  FF18 XAAA K2 4530000 FF18\n 3.000000000 4.000000000  FF18 XBBB K2 4530000 FF18\n', '');
  const text = ' 3   FF18 K2 XBBB M 180 051 25 000 000  0\n';
  expect(msaFor('XBBB', text, f, AIRPORT)[0]).toMatchObject({lat: 3, lon: 4});
});
