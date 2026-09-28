import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { deaths, events, feats, journalEntries, levelUps, players, sessions } from '../db/schema';
import { readServerState, type Schemas } from './common';
import { latestWorldSave, worldSaveOf } from './saves';

export type World = Schemas['World'];

export async function getWorld(db: Database): Promise<World> {
  const [state, save, rows] = await Promise.all([
    readServerState(db),
    latestWorldSave(db),
    db
      .select({
        players: sql<number>`(select count(*) from ${players} where ${players.hidden} = false)::int`,
        sessions: sql<number>`(select count(*) from ${sessions})::int`,
        playtime: sql<number>`(select coalesce(sum(${players.playtimeS}), 0) from ${players})::float8`,
        deaths: sql<number>`(select count(*) from ${deaths})::int`,
        levelUps: sql<number>`(select count(*) from ${levelUps})::int`,
        journal: sql<number>`(select count(*) from ${journalEntries})::int`,
        quests: sql<number>`(select count(*) from ${feats} where ${feats.kind} = 'quest')::int`,
        since: sql<Date | null>`(select min(${events.ts}) from ${events})`
      })
      .from(sql`(select 1) as one`)
  ]);
  const totals = rows[0];
  return {
    name: state?.serverName ?? null,
    world_name: state?.worldName ?? null,
    version: state?.serverVersion ?? null,
    max_players: state?.maxPlayers ?? null,
    save: worldSaveOf(save),
    totals: {
      players: totals?.players ?? 0,
      sessions: totals?.sessions ?? 0,
      playtime_s: Math.round(totals?.playtime ?? 0),
      deaths: totals?.deaths ?? 0,
      level_ups: totals?.levelUps ?? 0,
      journal_entries: totals?.journal ?? 0,
      quests_completed: totals?.quests ?? 0
    },
    tracking_since: totals?.since ? new Date(totals.since).toISOString() : null
  };
}
