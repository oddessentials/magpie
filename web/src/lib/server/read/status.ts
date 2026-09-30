import { and, asc, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { collectorRuns, players, sessions, worldSaves, type CollectorRunRow } from '../db/schema';
import { displayName, iso, platformName, readServerState, type Schemas } from './common';

export type Status = Schemas['Status'];
export type OnlineList = Schemas['OnlineList'];
export type OnlinePlayer = Schemas['OnlinePlayer'];
export type CollectorState = Schemas['StatusCollector']['state'];

export const collectorLostAfterSeconds = 180;
export const staleFloorSeconds = 600;
export const staleCeilingSeconds = 3600;
export const rateWindowSeconds = 3600;
export const rateBaselineSeconds = 600;

export interface ClockSave {
  savedAt: Date;
  worldGuid: string;
  day: number | null;
  clockSeconds: number | null;
}

const clockColumns = {
  savedAt: worldSaves.savedAt,
  worldGuid: worldSaves.worldGuid,
  day: worldSaves.day,
  clockSeconds: worldSaves.clockSeconds
};

async function latestSaves(db: Database): Promise<ClockSave[]> {
  return db.select(clockColumns).from(worldSaves).orderBy(desc(worldSaves.savedAt)).limit(3);
}

async function baselineSave(
  db: Database,
  newest: ClockSave,
  from: Date
): Promise<ClockSave | null> {
  const rows = await db
    .select(clockColumns)
    .from(worldSaves)
    .where(
      and(
        eq(worldSaves.worldGuid, newest.worldGuid),
        gte(worldSaves.savedAt, from),
        isNotNull(worldSaves.clockSeconds)
      )
    )
    .orderBy(asc(worldSaves.savedAt))
    .limit(1);
  return rows[0] ?? null;
}

export function staleAfterOf(saves: ClockSave[]): number {
  const same = saves.filter((save) => save.worldGuid === saves[0]?.worldGuid);
  const gaps = same
    .slice(1)
    .map((save, index) => (same[index]!.savedAt.getTime() - save.savedAt.getTime()) / 1000);
  const doubled = Math.round(2 * Math.max(0, ...gaps));
  return Math.min(staleCeilingSeconds, Math.max(staleFloorSeconds, doubled));
}

export function rateOf(newest: ClockSave, baseline: ClockSave | null): number {
  if (!baseline || newest.clockSeconds === null || baseline.clockSeconds === null) return 1;
  const elapsed = (newest.savedAt.getTime() - baseline.savedAt.getTime()) / 1000;
  if (elapsed < rateBaselineSeconds) return 1;
  const rate = Math.round(((newest.clockSeconds - baseline.clockSeconds) / elapsed) * 1e6) / 1e6;
  return rate >= 0.9 && rate <= 1 ? rate : 1;
}

async function clockOf(
  db: Database,
  saves: ClockSave[],
  onlineSince: Date | null
): Promise<Schemas['StatusClock'] | null> {
  const newest = saves[0];
  if (!newest || newest.clockSeconds === null) return null;
  const earliest = newest.savedAt.getTime() - rateWindowSeconds * 1000;
  const baseline = onlineSince
    ? await baselineSave(db, newest, new Date(Math.max(onlineSince.getTime(), earliest)))
    : null;
  return {
    seconds: newest.clockSeconds,
    observed_at: newest.savedAt.toISOString(),
    rate: rateOf(newest, baseline),
    stale_after_s: staleAfterOf(saves)
  };
}

export function remoteObservationOf(value: unknown): Schemas['RemoteObservation'] | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const interval = (key: string, minimum: number) =>
    typeof raw[key] === 'number' && Number.isFinite(raw[key]) && raw[key] >= minimum
      ? raw[key]
      : null;
  const instant = (key: string) =>
    typeof raw[key] === 'string' && Number.isFinite(Date.parse(raw[key]))
      ? new Date(raw[key]).toISOString()
      : null;
  const logs = interval('logs_poll_s', 1),
    saves = interval('saves_poll_s', 10);
  return logs === null && saves === null
    ? null
    : {
        logs_poll_s: logs,
        saves_poll_s: saves,
        logs_checked_at: instant('logs_checked_at'),
        saves_checked_at: instant('saves_checked_at')
      };
}

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
  const [state, run, online, saves] = await Promise.all([
    readServerState(db),
    latestRun(db),
    onlineCount(db),
    latestSaves(db)
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
  const clock = await clockOf(db, saves, live ? (state?.onlineSince ?? null) : null);
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
    save: { saved_at: iso(state?.saveAt), day: saves[0]?.day ?? null, clock },
    collector: {
      remote: remoteObservationOf(run?.heartbeat?.remote ?? run?.layers?.remote),
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
