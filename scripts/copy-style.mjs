// Copies the style kit (CSS, fonts, licences) from src/style to dist/style; tsc copies only code.
// Runs after tsc in `npm run build`. dist/style is replaced whole, so removed files leave too.
import {cpSync, rmSync} from 'node:fs';

const from = new URL('../src/style/', import.meta.url);
const to = new URL('../dist/style/', import.meta.url);

rmSync(to, {recursive: true, force: true});
cpSync(from, to, {recursive: true, filter: (src) => !/\.(ts|mts|cts)$/.test(src)});
