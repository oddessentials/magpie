import { and, inArray, isNotNull, isNull, lt, notInArray, sql } from 'drizzle-orm';
import type { components } from '$lib/api/types';
import { characterSaves, worldSaves } from '../db/schema';
import {
  findPlayer,
  findPlayerByGuid,
  loadServerState,
  parseInstant,
  updateServerState,
  type ProjectionContext,
  type StoredEvent
} from './context';

type Schemas = components['schemas'];

export interface SaveOutcome {
  playerId: number | null;
  quiet: boolean;
}

function text(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function integer(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

export async function applySaveWorld(
  ctx: ProjectionContext,
  event: StoredEvent
): Promise<SaveOutcome> {
  const data = event.data as unknown as Schemas['SaveWorldData'];
  const savedAt = parseInstant(data.saved_at);
  await ctx.tx
    .insert(worldSaves)
    .values({
      savedAt,
      worldGuid: data.world_guid,
      worldName: text(data.world_name),
      progress: data.progress ?? null,
      buildings: data.buildings ?? null,
      day: integer(data.day),
      timeOfDay: data.time_of_day ?? null,
      weather: (data.weather ?? []).map((entry) => ({
        region: entry.region,
        type: entry.type,
        day_count: integer(entry.day_count),
        remaining_s: entry.remaining_s ?? null
      })),
      events: (data.events ?? []).map((entry) => ({
        id: entry.id,
        name: text(entry.name),
        state: text(entry.state)
      })),
      hardcore: data.hardcore ?? null,
      friendlyFire: data.friendly_fire ?? null,
      difficulty: text(data.difficulty),
      sizeBytes: integer(data.size_bytes)
    })
    .onConflictDoNothing();
  const state = await loadServerState(ctx);
  if (!state.saveAt || savedAt >= state.saveAt) {
    await updateServerState(ctx, {
      saveAt: savedAt,
      saveDay: integer(data.day),
      worldGuid: data.world_guid,
      worldName: text(data.world_name) ?? state.worldName
    });
    ctx.effects.statusChanged = true;
  }
  return { playerId: null, quiet: true };
}

const newer = sql`excluded.saved_at >= ${characterSaves.savedAt}`;

export async function applySavePlayer(
  ctx: ProjectionContext,
  event: StoredEvent
): Promise<SaveOutcome> {
  const data = event.data as unknown as Schemas['SavePlayerData'];
  const values = {
    characterGuid: data.character_guid,
    savedAt: parseInstant(data.saved_at),
    userId: text(data.user_id),
    name: data.name,
    playtimeS: data.playtime_s ?? null,
    health: data.health?.current ?? null,
    maxHealth: data.health?.max ?? null,
    skills: data.skills.map((skill) => ({ id: skill.id, xp: skill.xp })),
    quests: data.quests.map((quest) => ({
      id: quest.id,
      state: quest.state,
      objective: text(quest.objective)
    })),
    journalUnlocked: integer(data.journal_unlocked),
    journalUnread: integer(data.journal_unread),
    spells: integer(data.spells),
    regionsRevealed: integer(data.regions_revealed),
    goneAt: null
  };
  await ctx.tx
    .insert(characterSaves)
    .values(values)
    .onConflictDoUpdate({ target: characterSaves.characterGuid, set: values, setWhere: newer });
  const player =
    (await findPlayerByGuid(ctx, data.character_guid)) ??
    (values.userId ? await findPlayer(ctx, values.userId) : null);
  return { playerId: player?.id ?? null, quiet: true };
}

export async function applySaveRead(
  ctx: ProjectionContext,
  event: StoredEvent
): Promise<SaveOutcome> {
  const data = event.data as unknown as Schemas['SaveReadData'];
  const savedAt = parseInstant(data.saved_at);
  const ids = data.character_guids;
  const stale = and(isNull(characterSaves.goneAt), lt(characterSaves.savedAt, savedAt));
  await ctx.tx
    .update(characterSaves)
    .set({ goneAt: savedAt })
    .where(ids.length > 0 ? and(stale, notInArray(characterSaves.characterGuid, ids)) : stale);
  if (ids.length > 0) {
    await ctx.tx
      .update(characterSaves)
      .set({ goneAt: null })
      .where(and(inArray(characterSaves.characterGuid, ids), isNotNull(characterSaves.goneAt)));
  }
  return { playerId: null, quiet: true };
}
