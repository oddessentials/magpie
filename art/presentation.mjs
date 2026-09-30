import sharp from 'sharp';

export const previewNames = ['today', 'player', 'world', 'map', 'ledger', 'journal', 'progression'];
export const dialPreview = { name: 'clock', widths: [340, 680] };

export async function previewVariants(source, name, widths = [720, 1440]) {
  const variants = [];
  for (const width of widths) {
    for (const [format, quality] of [
      ['avif', 52],
      ['webp', 82]
    ]) {
      const { data, info } = await sharp(source)
        .resize({ width })
        .toFormat(format, { quality, effort: 6 })
        .toBuffer({ resolveWithObject: true });
      variants.push({ name: `${name}-${width}.${format}`, data, ...info });
    }
  }
  return variants;
}
