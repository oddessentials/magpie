import sharp from 'sharp';

export const previewNames = ['today', 'player', 'world'];

export async function previewVariants(source, name) {
  const variants = [];
  for (const width of [720, 1440]) {
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
