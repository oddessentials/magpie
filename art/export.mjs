import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const art = fileURLToPath(new URL('.', import.meta.url));
const out = join(art, 'raster');
mkdirSync(out, { recursive: true });

const jobs = [
  [
    'source/wilds.png',
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

const icons = {
  'favicon-32': 'favicon-32.png',
  'favicon-180': 'apple-touch-icon.png',
  'favicon-192': 'icon-192.png',
  'favicon-512': 'icon-512.png',
  'maskable-512': 'icon-maskable-512.png'
};

const wanted = new Set(process.argv.slice(2));
for (const [source, sizes, formats] of jobs) {
  const name = source
    .split('/')
    .pop()
    .replace(/\.(svg|png)$/, '');
  if (wanted.size > 0 && !wanted.has(name)) continue;
  for (const [stem, width] of sizes) {
    for (const format of formats) {
      const target = join(out, `${stem}.${format}`);
      await sharp(join(art, source), source.endsWith('.svg') ? { density: 288 } : {})
        .resize({ width })
        .toFormat(format, options[format])
        .toFile(target);
      console.log(`art/raster/${stem}.${format} ${Math.round(statSync(target).size / 1024)} KB`);
      if (name === 'wilds' && format !== 'png') {
        copyFileSync(target, join(art, '../site/assets', `${stem}.${format}`));
        copyFileSync(target, join(art, '../web/static/art', `${stem}.${format}`));
      }
      if (icons[stem]) copyFileSync(target, join(art, '../web/static', icons[stem]));
    }
  }
  if (name === 'favicon') {
    for (const destination of ['../site/favicon.svg', '../web/static/favicon.svg']) {
      copyFileSync(join(art, source), join(art, destination));
    }
  }
}
