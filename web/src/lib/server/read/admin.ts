import { and, desc, eq, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import type {
  AdminEvent,
  AdminHealth,
  AdminPlayer,
  CollectorAdmin,
  CollectorRun
} from '$lib/api/types';
import { secrets } from '../auth/secrets';
import type { Database } from '../db/client';
import {
  collectorRuns,
  events,
  players,
  sessions,
  type CollectorRunRow,
  type PlayerRow
} from '../db/schema';
import { badRequest, notFound, type KeysetPage, type Page } from '../http/respond';
import { ingestStats } from '../ingest/ingest';
import { backupSummary } from '../jobs/backup';
import type { JobStatus } from '../jobs/scheduler';
import { displayName, platformName, playerRef, playersById, secondsBetween } from './common';
import { collectorStateOf, latestRun } from './status';

export function runOf(row: CollectorRunRow): CollectorRun {
  return {
    run_id: row.runId,
    name: row.collectorName,
    version: row.collectorVersion,
    os: row.os,
    arch: row.arch,
    started_at: row.startedAt.toISOString(),
    last_seen_at: row.lastSeenAt.toISOString(),
    stopped_at: row.stoppedAt ? row.stoppedAt.toISOString() : null,
    lost_at: row.lostAt ? row.lostAt.toISOString() : null,
    last_seq: row.lastSeq,
    layers: row.layers ?? null,
    server_version: row.serverVersion,
    world_guid: row.worldGuid,
    heartbeat: row.heartbeat ?? null,
    heartbeat_at: row.heartbeatAt ? row.heartbeatAt.toISOString() : null
  };
}

async function ingestCounters(now: Date) {
  const stats = await ingestStats(new Date(now.getTime() - 24 * 3600 * 1000));
  return {
    last_batch_at: stats.lastBatchAt ? stats.lastBatchAt.toISOString() : null,
    batches_24h: stats.batches,
    events_24h: stats.events,
    duplicates_24h: stats.duplicates,
    invalid_24h: stats.invalid,
    rejected_24h: stats.rejected
  };
}

export async function collectorAdmin(db: Database, now = new Date()): Promise<CollectorAdmin> {
  const runs = await db
    .select()
    .from(collectorRuns)
    .orderBy(desc(collectorRuns.startedAt))
    .limit(10);
  return {
    site_version: __APP_VERSION__,
    secret: await secrets.collectorSecret(),
    secret_from_environment: secrets.collectorSecretFromEnvironment(),
    runs: runs.map(runOf),
    ingest: await ingestCounters(now)
  };
}

function adminPlayerOf(row: PlayerRow, joinedAt: Date | null, now: Date): AdminPlayer {
  return {
    id: row.id,
    name: displayName(row),
    game_name: row.name,
    name_override: row.nameOverride,
    user_id: row.userId,
    character_guid: row.characterGuid,
    platform: platformName(row.platform),
    hidden: row.hidden,
    online: row.online,
    first_seen: row.firstSeen.toISOString(),
    last_seen: row.lastSeen.toISOString(),
    playtime_s: Math.round(row.playtimeS + (joinedAt ? secondsBetween(joinedAt, now) : 0)),
    sessions: row.sessions
  };
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function listAdminPlayers(
  db: Database,
  search: string | null,
  page: Page,
  now = new Date()
): Promise<AdminPlayer[]> {
  const conditions: SQL[] = [];
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(
      or(
        ilike(players.name, pattern),
        ilike(players.nameOverride, pattern),
        ilike(players.userId, pattern),
        ilike(players.characterGuid, pattern)
      )!
    );
  }
  const rows = await db
    .select({ player: players, joinedAt: sessions.joinedAt })
    .from(players)
    .leftJoin(sessions, eq(sessions.id, players.currentSessionId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(players.online), desc(players.lastSeen), desc(players.id))
    .limit(page.limit + 1)
    .offset(page.offset);
  return rows.map((row) => adminPlayerOf(row.player, row.joinedAt, now));
}

export interface PlayerPatch {
  nameOverride?: string | null;
  hidden?: boolean;
}

export function parsePlayerPatch(body: unknown): PlayerPatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('body must be a JSON object');
  }
  const record = body as Record<string, unknown>;
  const patch: PlayerPatch = {};
  for (const key of Object.keys(record)) {
    if (key !== 'name_override' && key !== 'hidden') throw badRequest(`${key} cannot be changed`);
  }
  if ('name_override' in record) {
    const value = record.name_override;
    if (value === null) patch.nameOverride = null;
    else if (typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 64) {
      patch.nameOverride = value.trim();
    } else {
      throw badRequest('name_override must be null or 1 to 64 characters');
    }
  }
  if ('hidden' in record) {
    if (typeof record.hidden !== 'boolean') throw badRequest('hidden must be true or false');
    patch.hidden = record.hidden;
  }
  return patch;
}

export async function updateAdminPlayer(
  db: Database,
  id: number,
  patch: PlayerPatch,
  now = new Date()
): Promise<AdminPlayer> {
  const values: Partial<typeof players.$inferInsert> = {};
  if (patch.nameOverride !== undefined) values.nameOverride = patch.nameOverride;
  if (patch.hidden !== undefined) values.hidden = patch.hidden;
  const rows =
    Object.keys(values).length > 0
      ? await db.update(players).set(values).where(eq(players.id, id)).returning()
      : await db.select().from(players).where(eq(players.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw notFound(`player ${id} does not exist`);
  const open = row.currentSessionId
    ? await db
        .select({ joinedAt: sessions.joinedAt })
        .from(sessions)
        .where(eq(sessions.id, row.currentSessionId))
        .limit(1)
    : [];
  return adminPlayerOf(row, open[0]?.joinedAt ?? null, now);
}

export interface EventQuery {
  type: string | null;
  invalid: boolean | null;
  playerId: number | null;
  page: KeysetPage;
}

export async function listAdminEvents(db: Database, query: EventQuery): Promise<AdminEvent[]> {
  const conditions: SQL[] = [];
  if (query.type) conditions.push(eq(events.type, query.type));
  if (query.invalid === true) conditions.push(sql`${events.invalid} is not null`);
  if (query.invalid === false) conditions.push(sql`${events.invalid} is null`);
  if (query.playerId !== null) conditions.push(eq(events.playerId, query.playerId));
  const after = query.page.after;
  if (after) {
    conditions.push(
      or(lt(events.ts, after.ts), and(eq(events.ts, after.ts), lt(events.id, after.id)))!
    );
  }
  const rows = await db
    .select()
    .from(events)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(events.ts), desc(events.id))
    .limit(query.page.limit + 1);
  const people = await playersById(
    db,
    rows.map((row) => row.playerId)
  );
  return rows.map((row) => {
    const person = row.playerId !== null ? people.get(row.playerId) : undefined;
    return {
      id: row.id,
      type: row.type,
      ts: row.ts.toISOString(),
      received_at: row.receivedAt.toISOString(),
      source: row.source === 'site' ? 'site' : 'collector',
      run_id: row.runId,
      seq: row.seq,
      invalid: row.invalid,
      quiet: row.quiet,
      player: person ? playerRef(person) : null,
      data: row.data as Record<string, unknown>
    };
  });
}

function heartbeatText(heartbeat: Record<string, unknown> | null, key: string): string | null {
  const value = heartbeat?.[key];
  return typeof value === 'string' ? value : null;
}

function heartbeatNumber(heartbeat: Record<string, unknown> | null, key: string): number | null {
  const value = heartbeat?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function adminHealth(
  db: Database,
  jobStatuses: JobStatus[],
  now = new Date()
): Promise<AdminHealth> {
  const run = await latestRun(db);
  const heartbeat = run?.heartbeat ?? null;
  const [counts] = await db
    .select({
      events: sql<number>`(select count(*) from ${events})::int`,
      size: sql<number>`pg_database_size(current_database())::float8`
    })
    .from(sql`(select 1) as one`);
  return {
    collector: {
      state: collectorStateOf(run, now),
      run: run ? runOf(run) : null,
      heartbeat_age_s: run?.heartbeatAt ? Math.round(secondsBetween(run.heartbeatAt, now)) : null,
      queue_depth: heartbeatNumber(heartbeat, 'queue_depth'),
      dropped_events: heartbeatNumber(heartbeat, 'dropped_events'),
      logs: heartbeatText(heartbeat, 'logs'),
      saves: heartbeatText(heartbeat, 'saves'),
      process: heartbeatText(heartbeat, 'process'),
      mod: heartbeatText(heartbeat, 'mod')
    },
    ingest: await ingestCounters(now),
    db: {
      events_total: counts?.events ?? 0,
      size_mb: Math.round(((counts?.size ?? 0) / 1024 / 1024) * 10) / 10
    },
    backup: await backupSummary(db),
    jobs: jobStatuses.map((job) => ({
      name: job.name,
      last_run_at: job.lastRunAt,
      last_ok: job.lastOk,
      last_error: job.lastError
    }))
  };
}
