import {describe, expect, test} from 'vitest';
import {datRows} from './datfile.ts';

// Made-up text in the layout of X-Plane's .dat files. Nothing here is copied from real data.
describe('datRows', () => {
  test('skips the header, splits on whitespace and stops at 99', () => {
    const r = datRows('I\n1200 Version - made-up\n\nA  B\tC\n99\nD E\n');
    expect(r).toEqual({version: '1200', rows: [['A', 'B', 'C']]});
  });

  test('reads CRLF text the same as LF', () => {
    const lf = 'I\n1200 Version - made-up\nA B\n99\n';
    expect(datRows(lf.replace(/\n/g, '\r\n'))).toEqual(datRows(lf));
  });

  test('a file without a version line has version ""', () => {
    expect(datRows('').version).toBe('');
  });
});
