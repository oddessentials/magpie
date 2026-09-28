import { desc, eq, isNull, and } from 'drizzle-orm';
import type { Database } from '../db/client';
import { characterSaves, worldSaves, type CharacterSaveRow, type WorldSaveRow } from '../db/schema';
import type { Schemas } from './common';

export type PlayerCharacter = Schemas['PlayerCharacter'];
export type WorldSave = Schemas['WorldSave'];

export function skillNameOf(id: string): string | null {
  return id === '' ? null : null;
}

export function characterOf(row: CharacterSaveRow | null | undefined): PlayerCharacter | null {
  if (!row || row.goneAt) return null;
  const completed = row.quests.filter((quest) => quest.state.toLowerCase() === 'completed').length;
  return {
    saved_at: row.savedAt.toISOString(),
    playtime_s: row.playtimeS,
    health:
      row.health !== null && row.maxHealth !== null
        ? { current: row.health, max: row.maxHealth }
        : null,
    skills: row.skills.map((skill) => ({
      id: skill.id,
      name: skillNameOf(skill.id),
      xp: skill.xp,
      level: null,
      next_level_xp: null
    })),
    total_level: null,
    quests: { active: row.quests.length - completed, completed },
    journal: { unlocked: row.journalUnlocked ?? 0, unread: row.journalUnread ?? 0 },
    spells: row.spells,
    regions_revealed: row.regionsRevealed
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
