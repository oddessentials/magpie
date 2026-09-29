import geography from '$lib/world/geography.json';

const fold = (key: string) => key.trim().toLowerCase();
const bossNames = new Map<string, string>();

for (const boss of geography.bosses) {
  if (!boss.name) continue;
  for (const key of [boss.id, boss.asset, boss.internalName, boss.name]) {
    if (key) bossNames.set(fold(key), boss.name);
  }
}

export function bossNameOf(key: string | null | undefined): string | null {
  return key ? (bossNames.get(fold(key)) ?? null) : null;
}

export function regionNameOf(id: number): string | null {
  return geography.regions.find((region) => region.id === id)?.name ?? null;
}

export const mapGuide = {
  version: geography.source.version,
  build: geography.source.build,
  regions: geography.regions.map(({ id, name }) => ({ id, name })),
  lodestones: geography.lodestones.map(({ id, name, regions }) => ({
    id,
    name,
    regions: regions.map((id) => regionNameOf(id) ?? String(id))
  })),
  bosses: [...new Set(geography.bosses.map((boss) => boss.name))].sort()
};
