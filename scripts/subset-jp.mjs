// Builds src/style/fonts/kk-mincho-subset.woff2: Noto Serif JP (OFL) cut down to the kanji of the
// family's names, so the signs read the same on devices without a system Mincho.
// Dev-only: run it by hand when the names change, then commit the font.
//
//   node scripts/subset-jp.mjs <path to NotoSerifJP[wght].ttf>
//
// The source is the variable font from Google's font repository (ofl/notoserifjp); its OFL text is
// kept beside the subset as src/style/fonts/NotoSerifJP-OFL.txt. The weight axis is pinned at 600,
// the weight the family's names are set in.
import {readFileSync, writeFileSync} from 'node:fs';
import subsetFont from 'subset-font';

// 拠点空港 Kuukou, 航路 Kouro, 航空図 Kōkūzu, 管制 Kansei, 航法 Kōhō, 格納庫 Kakunouko, 共有 kyouyou.
const NAMES = '拠点空港航路図管制法格納庫共有';
const KANJI = [...new Set(NAMES)].join('');
const WEIGHT = 600;
const OUT = new URL('../src/style/fonts/kk-mincho-subset.woff2', import.meta.url);

const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/subset-jp.mjs <NotoSerifJP[wght].ttf>');
  process.exit(1);
}

const font = await subsetFont(readFileSync(source), KANJI, {
  targetFormat: 'woff2',
  variationAxes: {wght: WEIGHT},
});
writeFileSync(OUT, font);
console.log(`${KANJI} (${[...KANJI].length} kanji) → ${font.length} bytes`);
