import type { CatalogUnlockStep } from '$lib/api/types';

const spaced = (text: string) =>
  text
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

export function categoryLabel(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const last = tag.split('.').at(-1);
  if (!last) return null;
  const words = spaced(last);
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

export function areaLabel(area: string | null | undefined): string | null {
  return area ? spaced(area) : null;
}

export function areaKey(area: string | null | undefined): string {
  return (area ?? '').replace(/[\s_]/g, '').toLowerCase();
}

export function listText(names: string[], joiner: 'and' | 'or' = 'and'): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${joiner} ${names.at(-1)}`;
}

export function stepText(step: CatalogUnlockStep): string {
  const joiner = step.match === 'any' ? 'or' : 'and';
  if (step.kind === 'skill_level') {
    return `Reach level ${step.level ?? '?'} in ${step.skill?.name ?? 'a skill'}`;
  }
  if (step.kind === 'interact') {
    return `Use ${listText(
      step.actors.map((actor) => actor.name),
      joiner
    )}`;
  }
  return `Pick up ${listText(
    step.items.map((item) => item.name ?? item.asset),
    joiner
  )}`;
}
