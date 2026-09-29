import { and, desc, eq, inArray, isNotNull, isNull, lt, notInArray, sql } from 'drizzle-orm';
import type { components } from '$lib/api/types';
import {
  characterSaves,
  characterSkillSamples,
  characterUnlocks,
  worldSaves,
  type SavedSkill,
  type SavedSlot
} from '../db/schema';
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
  const day = integer(data.day);
  await ctx.tx
    .insert(worldSaves)
    .values({
      savedAt,
      worldGuid: data.world_guid,
      worldName: text(data.world_name),
      progress: data.progress ?? null,
      buildings: data.buildings ?? null,
      bases: data.bases ?? null,
      requirements: data.requirements ?? null,
      discoveries: data.discoveries ?? null,
      day,
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
      saveDay: day,
      worldGuid: data.world_guid,
      worldName: text(data.world_name) ?? state.worldName
    });
    ctx.effects.statusChanged = true;
  }
  return { playerId: null, quiet: true };
}

const newer = sql`excluded.saved_at >= ${characterSaves.savedAt}`;

function slots(value: Schemas['SaveSlot'][] | null | undefined): SavedSlot[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((slot) => ({
    slot: slot.slot,
    item: slot.item,
    count: slot.count ?? null,
    durability: slot.durability ?? null
  }));
}

function xpKey(skills: SavedSkill[]): string {
  return JSON.stringify(skills.map((skill) => `${skill.id}:${skill.xp}`).sort());
}

export async function applySavePlayer(
  ctx: ProjectionContext,
  event: StoredEvent
): Promise<SaveOutcome> {
  const data = event.data as unknown as Schemas['SavePlayerData'];
  const position = data.position ?? null;
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
    inventory: slots(data.inventory),
    loadout: slots(data.loadout),
    x: position?.x ?? null,
    y: position?.y ?? null,
    z: position?.z ?? null,
    goneAt: null
  };
  await ctx.tx
    .insert(characterSaves)
    .values(values)
    .onConflictDoUpdate({ target: characterSaves.characterGuid, set: values, setWhere: newer });
  const [previous] = await ctx.tx
    .select({ skills: characterSkillSamples.skills })
    .from(characterSkillSamples)
    .where(
      and(
        eq(characterSkillSamples.characterGuid, values.characterGuid),
        lt(characterSkillSamples.savedAt, values.savedAt)
      )
    )
    .orderBy(desc(characterSkillSamples.savedAt))
    .limit(1);
  if (!previous || xpKey(previous.skills) !== xpKey(values.skills)) {
    await ctx.tx
      .insert(characterSkillSamples)
      .values({
        characterGuid: values.characterGuid,
        savedAt: values.savedAt,
        skills: values.skills
      })
      .onConflictDoNothing();
  }
  const player =
    (await findPlayerByGuid(ctx, data.character_guid)) ??
    (values.userId ? await findPlayer(ctx, values.userId) : null);
  return { playerId: player?.id ?? null, quiet: true };
}

export const unlockKinds = {
  recipe: 'recipes',
  building: 'buildings',
  item: 'items_picked_up',
  actor: 'actors_interacted',
  creature: 'creatures_killed',
  journal: 'journal'
} as const;

export type UnlockKind = keyof typeof unlockKinds;

export async function applySaveProgress(
  ctx: ProjectionContext,
  event: StoredEvent
): Promise<SaveOutcome> {
  const data = event.data as unknown as Schemas['SaveProgressData'];
  const firstSeenAt = parseInstant(data.saved_at);
  const rows: { characterGuid: string; kind: string; id: string; firstSeenAt: Date }[] = [];
  for (const [kind, key] of Object.entries(unlockKinds)) {
    const ids = data[key];
    if (!Array.isArray(ids)) continue;
    for (const id of new Set(ids)) {
      if (typeof id === 'string' && id !== '') {
        rows.push({ characterGuid: data.character_guid, kind, id, firstSeenAt });
      }
    }
  }
  for (let start = 0; start < rows.length; start += 1000) {
    await ctx.tx
      .insert(characterUnlocks)
      .values(rows.slice(start, start + 1000))
      .onConflictDoUpdate({
        target: [characterUnlocks.characterGuid, characterUnlocks.kind, characterUnlocks.id],
        set: { firstSeenAt: sql`least(${characterUnlocks.firstSeenAt}, excluded.first_seen_at)` }
      });
  }
  const player =
    (await findPlayerByGuid(ctx, data.character_guid)) ??
    (data.user_id ? await findPlayer(ctx, data.user_id) : null);
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
