import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../', import.meta.url);
const component = readFileSync(new URL('src/lib/ui/SunDial.svelte', root), 'utf8');

const art: [string, number][] = [
  ['dial-plate-1024.avif', 100_000],
  ['dial-plate-512.avif', 32_000],
  ['dial-plate-1024.webp', 200_000],
  ['dial-plate-512.webp', 64_000],
  ['sun-192.webp', 32_000],
  ['moon-192.webp', 32_000]
];

function magic(name: string): string {
  const bytes = readFileSync(new URL(`static/art/${name}`, root));
  if (name.endsWith('.avif')) return bytes.subarray(4, 12).toString('latin1');
  return `${bytes.subarray(0, 4).toString('latin1')} ${bytes.subarray(8, 12).toString('latin1')}`;
}

describe('the dial art', () => {
  it.each(art)('%s is referenced by the dial and stays under %i bytes', (name, budget) => {
    expect(component).toContain(`/art/${name}`);
    expect(statSync(new URL(`static/art/${name}`, root)).size).toBeLessThan(budget);
  });

  it('ships real AVIF and WebP containers', () => {
    for (const [name] of art) {
      expect(magic(name)).toBe(name.endsWith('.avif') ? 'ftypavif' : 'RIFF WEBP');
    }
  });
});
