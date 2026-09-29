import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { collectorRuns, players, sessions, type CollectorRunRow } from '../db/schema';
import { displayName, iso, platformName, readServerState, type Schemas } from './common';

export type Status = Schemas['Status'];
export type OnlineList = Schemas['OnlineList'];
export type OnlinePlayer = Schemas['OnlinePlayer'];
export type CollectorState = Schemas['StatusCollector']['state'];

export const collectorLostAfterSeconds = 180;

export async function latestRun(db: Database): Promise<CollectorRunRow | null> {
  const rows = await db
    .select()
    .from(collectorRuns)
    .orderBy(desc(collectorRuns.lastSeenAt))
    .limit(1);
  return rows[0] ?? null;
}

export function collectorStateOf(run: CollectorRunRow | null, now: Date): CollectorState {
  if (!run) return 'none';
  if (run.stoppedAt) return 'stopped';
  if (run.lostAt) return 'lost';
  if (now.getTime() - run.lastSeenAt.getTime() > collectorLostAfterSeconds * 1000) return 'lost';
  return 'active';
}

function layersOf(run: CollectorRunRow | null): Schemas['CollectorLayersSummary'] | null {
  const layers = run?.layers;
  if (!layers) return null;
  const flag = (name: string) => layers[name] === true;
  return { logs: flag('logs'), saves: flag('saves'), process: flag('process'), mod: flag('mod') };
}

export async function onlineCount(db: Database): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(players)
    .where(and(eq(players.online, true), eq(players.hidden, false)));
  return rows[0]?.count ?? 0;
}

export async function computeStatus(db: Database, now = new Date()): Promise<Status> {
  const [state, run, online] = await Promise.all([
    readServerState(db),
    latestRun(db),
    onlineCount(db)
  ]);
  const collector = collectorStateOf(run, now);
  let current: Status['state'] = 'unknown';
  let since: Date | null = null;
  if (collector === 'lost') {
    since = run?.lostAt ?? run?.lastSeenAt ?? null;
  } else if (collector === 'stopped') {
    since = run?.stoppedAt ?? null;
  } else if (collector === 'active' && state) {
    if (state.online) {
      current = 'online';
      since = state.onlineSince;
    } else if (state.offlineSince) {
      current = 'offline';
      since = state.offlineSince;
    }
  }
  const live = current === 'online';
  return {
    state: current,
    since: iso(since),
    server: {
      name: state?.serverName ?? null,
      version: state?.serverVersion ?? null,
      world_name: state?.worldName ?? null
    },
    players: {
      online: live ? online : 0,
      max: state?.maxPlayers ?? null,
      observed_at: live ? iso(state?.presenceAt) : null
    },
    process: {
      memory_mb: live ? (state?.memoryMb ?? null) : null,
      uptime_s: live ? (state?.uptimeS ?? null) : null,
      cpu_percent: live ? (state?.cpuPercent ?? null) : null,
      measured_at: live ? iso(state?.metricsAt) : null
    },
    save: { saved_at: iso(state?.saveAt), day: state?.saveDay ?? null },
    collector: {
      state: collector,
      version: run?.collectorVersion ?? null,
      last_seen_at: run ? run.lastSeenAt.toISOString() : null,
      layers: layersOf(run)
    },
    stopping: live && state?.stoppingAt !== null && state?.stoppingAt !== undefined,
    updated_at: now.toISOString()
  };
}

export async function computeOnline(db: Database, now = new Date()): Promise<OnlineList> {
  const rows = await db
    .select({ player: players, joinedAt: sessions.joinedAt })
    .from(players)
    .leftJoin(sessions, eq(sessions.id, players.currentSessionId))
    .where(and(eq(players.online, true), eq(players.hidden, false)))
    .orderBy(asc(sessions.joinedAt), asc(players.id));
  const state = await readServerState(db);
  const list: OnlinePlayer[] = rows.map(({ player, joinedAt }) => ({
    id: player.id,
    name: displayName(player),
    platform: platformName(player.platform),
    joined_at: (joinedAt ?? player.lastSeen).toISOString(),
    down: player.dead
  }));
  return { players: list, observed_at: iso(state?.presenceAt), updated_at: now.toISOString() };
}
