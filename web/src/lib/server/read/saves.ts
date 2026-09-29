import { desc, eq, isNull, and } from 'drizzle-orm';
import { isQuestComplete } from '$lib/quests';
import type { Database } from '../db/client';
import {
  characterSaves,
  worldSaves,
  type CharacterSaveRow,
  type SavedSlot,
  type WorldSaveRow
} from '../db/schema';
import type { Schemas } from './common';
import { levelForXp, skillFacts, skillOf, xpToReach } from './facts';
import { itemsById } from './lookup';

export type PlayerCharacter = Schemas['PlayerCharacter'];
export type PlayerSkill = Schemas['PlayerSkill'];
export type WorldSave = Schemas['WorldSave'];

export function skillsOf(saved: { id: string; xp: number }[]): PlayerSkill[] {
  const byId = new Map(saved.map((skill) => [skill.id, skill.xp]));
  const known = skillFacts.map((fact) => {
    const xp = byId.get(fact.id) ?? 0;
    const level = levelForXp(xp, fact.maxLevel);
    return {
      id: fact.id,
      name: fact.name,
      xp,
      level,
      level_xp: xpToReach(level),
      next_level_xp: level >= fact.maxLevel ? null : xpToReach(level + 1)
    };
  });
  const extra = saved
    .filter((skill) => !skillOf(skill.id))
    .map((skill) => ({
      id: skill.id,
      name: null,
      xp: skill.xp,
      level: null,
      level_xp: null,
      next_level_xp: null
    }));
  return [...known, ...extra];
}

export function totalLevelOf(skills: PlayerSkill[]): number | null {
  const levels = skills.map((skill) => skill.level).filter((level) => level !== null);
  return levels.length === 0 ? null : levels.reduce((sum, level) => sum + level, 0);
}

export interface CharacterExtras {
  unlocks: Schemas['PlayerUnlocks'] | null;
  history: PlayerCharacter['level_history'];
}

export function slotOf(slot: SavedSlot): Schemas['PlayerSlot'] {
  const item = itemsById.get(slot.item);
  return {
    slot: slot.slot,
    item: item?.asset ?? null,
    name: item?.name ?? null,
    count: slot.count ?? 1,
    at_least: slot.count === null,
    durability: slot.durability
  };
}

export function characterOf(
  row: CharacterSaveRow | null | undefined,
  extras: CharacterExtras = { unlocks: null, history: [] }
): PlayerCharacter | null {
  if (!row || row.goneAt) return null;
  const completed = row.quests.filter((quest) => isQuestComplete(quest.state)).length;
  const skills = skillsOf(row.skills);
  return {
    saved_at: row.savedAt.toISOString(),
    playtime_s: row.playtimeS,
    health:
      row.health !== null && row.maxHealth !== null
        ? { current: row.health, max: row.maxHealth }
        : null,
    skills,
    total_level: totalLevelOf(skills),
    quests: { active: row.quests.length - completed, completed },
    journal: { unlocked: row.journalUnlocked ?? 0, unread: row.journalUnread ?? 0 },
    spells: row.spells,
    regions_revealed: row.regionsRevealed,
    inventory: row.inventory ? row.inventory.map(slotOf) : null,
    loadout: row.loadout ? row.loadout.map(slotOf) : null,
    unlocks: extras.unlocks,
    level_history: extras.history
  };
}

export async function characterSaveOf(
  db: Database,
  characterGuid: string | null,
  userId: string | null
): Promise<CharacterSaveRow | null> {
  if (characterGuid) {
    const rows = await db
      .select()
      .from(characterSaves)
      .where(eq(characterSaves.characterGuid, characterGuid))
      .limit(1);
    if (rows[0]) return rows[0];
  }
  if (userId) {
    const rows = await db
      .select()
      .from(characterSaves)
      .where(and(eq(characterSaves.userId, userId), isNull(characterSaves.goneAt)))
      .orderBy(desc(characterSaves.savedAt))
      .limit(1);
    return rows[0] ?? null;
  }
  return null;
}

export function worldSaveOf(row: WorldSaveRow | null | undefined): WorldSave | null {
  if (!row) return null;
  return {
    progress: row.progress,
    buildings: row.buildings,
    discoveries: row.discoveries,
    saved_at: row.savedAt.toISOString(),
    day: row.day,
    time_of_day: row.timeOfDay,
    weather: row.weather.map((entry) => ({
      region: entry.region,
      type: entry.type,
      day_count: entry.day_count,
      remaining_s: entry.remaining_s
    })),
    events: row.events.map((entry) => ({ id: entry.id, name: entry.name, state: entry.state })),
    hardcore: row.hardcore,
    friendly_fire: row.friendlyFire,
    difficulty: row.difficulty,
    size_bytes: row.sizeBytes
  };
}

export async function latestWorldSave(db: Database): Promise<WorldSaveRow | null> {
  const rows = await db.select().from(worldSaves).orderBy(desc(worldSaves.savedAt)).limit(1);
  return rows[0] ?? null;
}
