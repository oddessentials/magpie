import journalJson from '$lib/world/journal.json';
import questsJson from '$lib/world/quests.json';
import skillsJson from '$lib/world/skills.json';
import xpJson from '$lib/world/xp.json';

export interface SkillFact {
  id: string;
  asset: string;
  name: string;
  order: number;
  maxLevel: number;
}

const fold = (value: string) => value.trim().toLowerCase();

export const skillFacts: SkillFact[] = skillsJson.skills
  .filter((skill) => !skill.deleted)
  .map((skill) => ({
    id: skill.id,
    asset: skill.asset,
    name: skill.name,
    order: skill.enum,
    maxLevel: skill.maxLevel ?? 99
  }))
  .sort((a, b) => a.order - b.order);

const skillKeys = new Map<string, SkillFact>();
for (const skill of skillFacts) {
  for (const key of [skill.id, skill.asset, skill.name, `skill_${skill.name}`]) {
    skillKeys.set(fold(key), skill);
  }
}

export function skillOf(key: string | null | undefined): SkillFact | null {
  if (!key) return null;
  return skillKeys.get(fold(key)) ?? null;
}

export const xpForLevel: readonly number[] = xpJson.xpForLevel;

export function levelForXp(xp: number, maxLevel = 99): number {
  let level = 1;
  for (let index = 1; index < xpForLevel.length; index += 1) {
    if (xp >= xpForLevel[index]!) level = index + 1;
    else break;
  }
  return Math.min(level, maxLevel);
}

export function xpToReach(level: number): number | null {
  return xpForLevel[level - 1] ?? null;
}

const journalNames = new Map<string, string>();
for (const entry of journalJson.entries) {
  const key = fold(entry.asset);
  if (typeof entry.name !== 'string') continue;
  if (!entry.deleted || !journalNames.has(key)) journalNames.set(key, entry.name);
}

export function journalNameOf(asset: string | null | undefined): string | null {
  if (!asset) return null;
  return journalNames.get(fold(asset)) ?? null;
}

const questNames = new Map<string, string>();
for (const quest of questsJson.quests) {
  if (typeof quest.name !== 'string') continue;
  for (const key of [quest.id, quest.asset, quest.internalName, quest.name]) {
    if (typeof key === 'string' && key !== '') questNames.set(fold(key), quest.name);
  }
}

export function questNameOf(key: string | null | undefined): string | null {
  if (!key) return null;
  return questNames.get(fold(key)) ?? null;
}
