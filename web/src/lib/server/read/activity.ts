import { and, asc, desc, eq, gt, inArray, isNull, lt, or, type SQL } from 'drizzle-orm';
import type { Database } from '../db/client';
import { deaths, events, players, sessions, type EventRow } from '../db/schema';
import { badRequest, type KeysetPage } from '../http/respond';
import type { Features } from '../settings';
import { chatChannel, playerRef, playersById, type Schemas } from './common';
import { journalNameOf, questNameOf, skillOf } from './facts';
import { bossNameOf } from './geography';

export type ActivityItem = Schemas['ActivityItem'];
export type ActivityType = Schemas['ActivityType'];
export type ActivityDetails = Schemas['ActivityDetails'];

export const activityTypes: readonly ActivityType[] = [
  'server.online',
  'server.stopping',
  'server.offline',
  'collector.lost',
  'player.joined',
  'player.left',
  'player.died',
  'journal.unlocked',
  'skill.level_up',
  'quest.updated',
  'chat.message',
  'player.kicked'
];

export function visibleTypes(features: Features, requested: readonly ActivityType[] | null) {
  return (requested ?? activityTypes).filter((type) =>
    type === 'chat.message' ? features.chat : true
  );
}

export function parseTypes(raw: string | null): ActivityType[] | null {
  if (raw === null || raw.trim() === '') return null;
  const types = raw.split(',').map((part) => part.trim());
  for (const type of types) {
    if (!(activityTypes as readonly string[]).includes(type)) {
      throw badRequest(`${type} is not an activity type`);
    }
  }
  return types as ActivityType[];
}

function feedFilter(types: readonly ActivityType[]): SQL {
  return and(
    inArray(events.type, types.length > 0 ? [...types] : ['none']),
    eq(events.quiet, false),
    isNull(events.invalid),
    or(isNull(events.playerId), eq(players.hidden, false))!
  )!;
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export async function buildActivityItems(db: Database, rows: EventRow[]): Promise<ActivityItem[]> {
  if (rows.length === 0) return [];
  const people = await playersById(
    db,
    rows.map((row) => row.playerId)
  );
  const diedIds = rows.filter((row) => row.type === 'player.died').map((row) => row.id);
  const known = new Map<string, typeof deaths.$inferSelect>();
  if (diedIds.length > 0) {
    const found = await db.select().from(deaths).where(inArray(deaths.eventId, diedIds));
    for (const death of found) known.set(death.eventId, death);
  }
  const leftIds = rows.filter((row) => row.type === 'player.left').map((row) => row.id);
  const durations = new Map<string, number | null>();
  if (leftIds.length > 0) {
    const closed = await db
      .select({ leftEventId: sessions.leftEventId, durationS: sessions.durationS })
      .from(sessions)
      .where(inArray(sessions.leftEventId, leftIds));
    for (const row of closed) {
      if (row.leftEventId) durations.set(row.leftEventId, row.durationS);
    }
  }
  return rows.map((row) => {
    const data = row.data as Record<string, unknown>;
    const person = row.playerId !== null ? people.get(row.playerId) : undefined;
    const details: ActivityDetails = {};
    switch (row.type) {
      case 'player.left':
        details.session_s = durations.get(row.id) ?? null;
        break;
      case 'player.died': {
        const death = known.get(row.id);
        details.cause = death ? death.cause : stringOf(data.cause);
        const killer = death ? death.killer : stringOf(data.killer);
        details.killer = bossNameOf(killer) ?? killer;
        break;
      }
      case 'journal.unlocked':
        details.entry = stringOf(data.entry) ?? '';
        details.entry_name = journalNameOf(details.entry);
        break;
      case 'skill.level_up':
        details.skill = stringOf(data.skill) ?? '';
        details.skill_name = skillOf(details.skill)?.name ?? null;
        details.level = numberOf(data.level) ?? 0;
        break;
      case 'quest.updated':
        details.quest = stringOf(data.quest) ?? '';
        details.quest_name = questNameOf(details.quest);
        details.state = stringOf(data.state) ?? '';
        details.objective = stringOf(data.objective);
        break;
      case 'chat.message':
        details.channel = chatChannel(stringOf(data.channel) ?? '');
        details.text = stringOf(data.text) ?? '';
        break;
      case 'player.kicked':
        details.by = stringOf(data.by);
        details.reason = stringOf(data.reason);
        break;
      case 'server.online':
        details.version = stringOf(data.version);
        break;
      case 'server.stopping':
        details.by = stringOf(data.by);
        break;
      case 'server.offline':
        details.reason = stringOf(data.reason) ?? 'unreachable';
        break;
      case 'collector.lost':
        details.last_seen_at = stringOf(data.last_seen_at) ?? row.ts.toISOString();
        break;
    }
    return {
      id: row.id,
      type: row.type as ActivityType,
      ts: row.ts.toISOString(),
      player: person ? playerRef(person) : null,
      details
    };
  });
}

export interface ActivityQuery {
  types: ActivityType[] | null;
  playerId: number | null;
  page: KeysetPage;
}

export async function listActivity(
  db: Database,
  features: Features,
  query: ActivityQuery
): Promise<{ rows: EventRow[] }> {
  const conditions: SQL[] = [feedFilter(visibleTypes(features, query.types))];
  if (query.playerId !== null) conditions.push(eq(events.playerId, query.playerId));
  const after = query.page.after;
  if (after) {
    conditions.push(
      or(lt(events.ts, after.ts), and(eq(events.ts, after.ts), lt(events.id, after.id)))!
    );
  }
  const rows = await db
    .select({ event: events })
    .from(events)
    .leftJoin(players, eq(players.id, events.playerId))
    .where(and(...conditions))
    .orderBy(desc(events.ts), desc(events.id))
    .limit(query.page.limit + 1);
  return { rows: rows.map((row) => row.event) };
}

export async function feedRowsByIds(
  db: Database,
  features: Features,
  ids: string[]
): Promise<EventRow[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ event: events })
    .from(events)
    .leftJoin(players, eq(players.id, events.playerId))
    .where(and(inArray(events.id, ids), feedFilter(visibleTypes(features, null))))
    .orderBy(asc(events.ts), asc(events.id));
  return rows.map((row) => row.event);
}

export async function feedRowsAfter(
  db: Database,
  features: Features,
  lastEventId: string,
  limit: number
): Promise<EventRow[]> {
  if (!/^[0-9a-fA-F-]{36}$/.test(lastEventId)) return [];
  const anchor = await db
    .select({ ts: events.ts, id: events.id })
    .from(events)
    .where(eq(events.id, lastEventId))
    .limit(1);
  const from = anchor[0];
  if (!from) return [];
  const rows = await db
    .select({ event: events })
    .from(events)
    .leftJoin(players, eq(players.id, events.playerId))
    .where(
      and(
        feedFilter(visibleTypes(features, null)),
        or(gt(events.ts, from.ts), and(eq(events.ts, from.ts), gt(events.id, from.id)))
      )
    )
    .orderBy(asc(events.ts), asc(events.id))
    .limit(limit);
  return rows.map((row) => row.event);
}
