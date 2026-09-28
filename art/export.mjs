import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const art = fileURLToPath(new URL('.', import.meta.url));
const out = join(art, 'raster');
mkdirSync(out, { recursive: true });

const jobs = [
  [
    'wilds.svg',
    [
      ['wilds-1600', 1600],
      ['wilds-800', 800]
    ],
    ['png', 'webp', 'avif']
  ],
  [
    'dial-plate.svg',
    [
      ['dial-plate-1024', 1024],
      ['dial-plate-512', 512]
    ],
    ['png', 'webp', 'avif']
  ],
  [
    'favicon.svg',
    [
      ['favicon-32', 32],
      ['favicon-180', 180],
      ['favicon-192', 192],
      ['favicon-512', 512]
    ],
    ['png']
  ],
  ['maskable.svg', [['maskable-512', 512]], ['png']],
  ['palette.svg', [['palette-1200', 1200]], ['png']]
];

const options = {
  webp: { quality: 76, effort: 6 },
  avif: { quality: 52, effort: 6 },
  png: { compressionLevel: 9 }
};

const wanted = new Set(process.argv.slice(2));
for (const [source, sizes, formats] of jobs) {
  if (wanted.size > 0 && !wanted.has(source.replace('.svg', ''))) continue;
  for (const [stem, width] of sizes) {
    for (const format of formats) {
      const target = join(out, `${stem}.${format}`);
      await sharp(join(art, source), { density: 288 })
        .resize({ width })
        .toFormat(format, options[format])
        .toFile(target);
      console.log(`art/raster/${stem}.${format} ${Math.round(statSync(target).size / 1024)} KB`);
    }
  }
}
