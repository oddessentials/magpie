import { and, asc, desc, eq, gte, ilike, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  characterSkillSamples,
  deaths,
  feats,
  journalEntries,
  levelUps,
  players,
  sessions,
  type CharacterSaveRow,
  type PlayerRow,
  type SessionRow
} from '../db/schema';
import { notFound, type Page } from '../http/respond';
import type { Features } from '../settings';
import { unlocksOf } from './characters';
import { displayName, platformName, secondsBetween, type Schemas } from './common';
import { countedKinds, isKnownUnlock } from './lookup';
import {
  characterOf,
  characterSaveOf,
  skillsOf,
  totalLevelOf,
  type CharacterExtras
} from './saves';

export type PlayerSummary = Schemas['PlayerSummary'];
export type Player = Schemas['Player'];
export type Session = Schemas['Session'];

export const playerSorts = ['last_seen', 'playtime', 'deaths', 'name'] as const;
export type PlayerSort = (typeof playerSorts)[number];

async function featsOf(db: Database, playerId: number): Promise<Schemas['PlayerFeats'] | null> {
  const [kinds, journal, levels] = await Promise.all([
    db
      .select({ kind: feats.kind, count: sql<number>`count(*)::int` })
      .from(feats)
      .where(eq(feats.playerId, playerId))
      .groupBy(feats.kind),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(journalEntries)
      .where(eq(journalEntries.playerId, playerId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(levelUps)
      .where(eq(levelUps.playerId, playerId))
  ]);
  const count = (kind: string) => kinds.find((row) => row.kind === kind)?.count ?? 0;
  const result = {
    journal_entries: journal[0]?.count ?? 0,
    level_ups: levels[0]?.count ?? 0,
    quests_completed: count('quest'),
    buildings: count('build'),
    crafts: count('craft')
  };
  return Object.values(result).some((value) => value > 0) ? result : null;
}

const livePlaytime = sql<number>`(${players.playtimeS} + coalesce(extract(epoch from (now() - ${sessions.joinedAt})), 0))`;

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function summaryOf(row: PlayerRow, joinedAt: Date | null, now: Date): PlayerSummary {
  return {
    id: row.id,
    name: displayName(row),
    platform: platformName(row.platform),
    online: row.online,
    first_seen: row.firstSeen.toISOString(),
    last_seen: (row.online ? now : row.lastSeen).toISOString(),
    playtime_s: Math.round(row.playtimeS + (joinedAt ? secondsBetween(joinedAt, now) : 0)),
    sessions: row.sessions,
    deaths: row.deaths
  };
}

export async function listPlayers(
  db: Database,
  sort: PlayerSort,
  search: string | null,
  page: Page,
  now = new Date()
): Promise<PlayerSummary[]> {
  const conditions: SQL[] = [eq(players.hidden, false)];
  if (search) {
    conditions.push(
      ilike(sql`coalesce(${players.nameOverride}, ${players.name})`, `%${escapeLike(search)}%`)
    );
  }
  const order =
    sort === 'playtime'
      ? [desc(livePlaytime), asc(players.id)]
      : sort === 'deaths'
        ? [desc(players.deaths), desc(players.lastSeen), asc(players.id)]
        : sort === 'name'
          ? [asc(sql`lower(coalesce(${players.nameOverride}, ${players.name}))`), asc(players.id)]
          : [desc(players.online), desc(players.lastSeen), asc(players.id)];
  const rows = await db
    .select({ player: players, joinedAt: sessions.joinedAt })
    .from(players)
    .leftJoin(sessions, eq(sessions.id, players.currentSessionId))
    .where(and(...conditions))
    .orderBy(...order)
    .limit(page.limit + 1)
    .offset(page.offset);
  return rows.map((row) => summaryOf(row.player, row.joinedAt, now));
}

export async function visiblePlayer(db: Database, id: number): Promise<PlayerRow> {
  const rows = await db.select().from(players).where(eq(players.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.hidden) throw notFound(`player ${id} does not exist`);
  return row;
}

export function sessionOf(row: SessionRow): Session {
  return {
    id: row.id,
    joined_at: row.joinedAt.toISOString(),
    left_at: row.leftAt ? row.leftAt.toISOString() : null,
    duration_s: row.durationS === null ? null : Math.round(row.durationS),
    end_reason: row.endReason ?? null,
    deaths: row.deaths
  };
}

async function extrasOf(
  db: Database,
  save: CharacterSaveRow | null,
  now: Date
): Promise<CharacterExtras> {
  if (!save) return { unlocks: null, history: [] };
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [unlocked, samples] = await Promise.all([
    unlocksOf(db, [save.characterGuid], countedKinds),
    db
      .select()
      .from(characterSkillSamples)
      .where(
        and(
          eq(characterSkillSamples.characterGuid, save.characterGuid),
          gte(characterSkillSamples.savedAt, since)
        )
      )
      .orderBy(asc(characterSkillSamples.savedAt))
  ]);
  const points = samples.flatMap((sample) => {
    const total = totalLevelOf(skillsOf(sample.skills));
    return total === null ? [] : [{ saved_at: sample.savedAt.toISOString(), total_level: total }];
  });
  const known = unlocked.filter(isKnownUnlock);
  const count = (kind: string) => known.filter((row) => row.kind === kind).length;
  return {
    unlocks:
      unlocked.length === 0
        ? null
        : {
            recipes: count('recipe'),
            buildings: count('building'),
            journal: count('journal'),
            creatures: count('creature')
          },
    history: points.filter(
      (point, index) =>
        index === 0 ||
        index === points.length - 1 ||
        point.total_level !== points[index - 1]!.total_level
    )
  };
}

export async function getPlayer(
  db: Database,
  id: number,
  features: Features,
  now = new Date()
): Promise<Player> {
  const row = await visiblePlayer(db, id);
  const [current, recent, died, save, done] = await Promise.all([
    row.currentSessionId === null
      ? Promise.resolve([] as SessionRow[])
      : db.select().from(sessions).where(eq(sessions.id, row.currentSessionId)).limit(1),
    db
      .select()
      .from(sessions)
      .where(eq(sessions.playerId, id))
      .orderBy(desc(sessions.joinedAt), desc(sessions.id))
      .limit(5),
    db
      .select()
      .from(deaths)
      .where(eq(deaths.playerId, id))
      .orderBy(desc(deaths.at), desc(deaths.id))
      .limit(5),
    characterSaveOf(db, row.characterGuid, row.userId),
    featsOf(db, id)
  ]);
  const open = current[0] ?? null;
  return {
    ...summaryOf(row, open?.joinedAt ?? null, now),
    current_session: open ? { id: open.id, joined_at: open.joinedAt.toISOString() } : null,
    chat_messages: features.chat ? row.chatMessages : null,
    recent_sessions: recent.map(sessionOf),
    recent_deaths: died.map((death) => ({
      at: death.at.toISOString(),
      cause: death.cause,
      killer: death.killer,
      source: death.source === 'mod' || death.mergedEventId ? 'mod' : 'log'
    })),
    character: characterOf(save, await extrasOf(db, save, now)),
    feats: done
  };
}

export async function listSessions(db: Database, playerId: number, page: Page): Promise<Session[]> {
  await visiblePlayer(db, playerId);
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.playerId, playerId))
    .orderBy(desc(sessions.joinedAt), desc(sessions.id))
    .limit(page.limit + 1)
    .offset(page.offset);
  return rows.map(sessionOf);
}
