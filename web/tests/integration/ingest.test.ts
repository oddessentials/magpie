import { randomUUID } from 'node:crypto';
import { asc, eq, isNull, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { IngestBatch, IngestResult } from '../../src/lib/api/types';
import { getDb } from '../../src/lib/server/db/client';
import {
  characterSaves,
  chatMessages,
  collectorRuns,
  deaths,
  events,
  feats,
  journalEntries,
  levelUps,
  players,
  sessions,
  worldSaves
} from '../../src/lib/server/db/schema';
import { runWatchdog } from '../../src/lib/server/jobs/watchdog';
import { rebuildProjections } from '../../src/lib/server/jobs/rebuild';
import { computeOnline, computeStatus } from '../../src/lib/server/read/status';
import { getPlayer } from '../../src/lib/server/read/players';
import { getWorld } from '../../src/lib/server/read/world';
import { defaultSettings } from '../../src/lib/server/settings';
import { POST as ingest } from '../../src/routes/api/ingest/+server';
import { resetDatabase, routeEvent, seededHistory, signedRequest, useTestDatabase } from './setup';
import { toBatches, type SimulatedHistory } from '../../scripts/simulator/generator';

vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

async function post(batch: IngestBatch | string, overrides: Record<string, string> = {}) {
  return ingest(routeEvent(signedRequest(batch, overrides)));
}

async function send(batch: IngestBatch): Promise<IngestResult> {
  const response = await post(batch);
  expect(response.status).toBe(200);
  return (await response.json()) as IngestResult;
}

function envelope(
  history: SimulatedHistory,
  type: string,
  data: Record<string, unknown>,
  at: Date,
  seq = 900_000
) {
  const runId = history.runs[history.runs.length - 1]!.runId;
  return {
    collector: { name: 'magpie-collector', version: '0.1.0', run_id: runId },
    server: history.server,
    events: [{ id: randomUUID(), seq, run_id: runId, ts: at.toISOString(), type, data }]
  } as IngestBatch;
}

let history: SimulatedHistory;
let batches: IngestBatch[];

beforeAll(async () => {
  useTestDatabase();
  await resetDatabase();
  history = seededHistory(2);
  batches = toBatches(history);
});

describe('POST /api/ingest', () => {
  it('rejects bad signatures and stale timestamps with 401', async () => {
    const batch = batches[0]!;
    expect((await post(batch, { 'x-magpie-signature': 'sha256=' + '0'.repeat(64) })).status).toBe(
      401
    );
    expect(
      (await post(batch, { 'x-magpie-timestamp': String(Math.floor(Date.now() / 1000) - 3600) }))
        .status
    ).toBe(401);
    const unsigned = new Request('http://test/api/ingest', {
      method: 'POST',
      body: JSON.stringify(batch)
    });
    expect((await ingest(routeEvent(unsigned))).status).toBe(401);
  });

  it('rejects malformed envelopes with 422 and oversized bodies with 413', async () => {
    expect((await post('{"collector":{}}')).status).toBe(422);
    expect((await post('not json')).status).toBe(422);
    const first = batches[0]!;
    const repeated = { ...first, events: [first.events[0]!, first.events[0]!] };
    expect((await post(repeated)).status).toBe(422);
    const tooMany = {
      ...first,
      events: Array.from({ length: 501 }, (_, index) => ({
        ...first.events[0]!,
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        seq: index
      }))
    };
    expect((await post(tooMany)).status).toBe(422);
    expect((await post(JSON.stringify({ ...first, padding: 'x'.repeat(600 * 1024) }))).status).toBe(
      413
    );
  });

  it('stores every event once, counts replays as duplicates and reports the last seq', async () => {
    const first = batches[0]!;
    const result = await send({ ...first, events: [...first.events].reverse() });
    expect(result.accepted).toBe(first.events.length);
    expect(result.duplicates).toBe(0);
    expect(result.invalid).toBe(0);
    expect(result.last_seq).toBe(Math.max(...first.events.map((event) => event.seq)));
    expect(result.actions).toEqual([]);
    const replay = await send(first);
    expect(replay.accepted).toBe(0);
    expect(replay.duplicates).toBe(first.events.length);
  });

  it('projects the whole simulated history', async () => {
    for (const batch of batches.slice(1)) await send(batch);
    const db = getDb();
    const count = async (table: PgTable) =>
      (await db.select({ n: sql<number>`count(*)::int` }).from(table))[0]!.n;
    const typed = (type: string) => history.events.filter((event) => event.type === type);
    const seen = new Set(typed('player.joined').map((event) => event.data.user_id));
    expect(await count(players)).toBe(seen.size);
    expect(await count(levelUps)).toBe(typed('skill.level_up').length);
    const died = typed('player.died');
    const fromLog = died.filter((event) => (event.data as { source: string }).source === 'log');
    expect(died.length).toBe(fromLog.length * 2);
    expect(await count(deaths)).toBe(fromLog.length);
    const merged = await db
      .select()
      .from(deaths)
      .where(sql`${deaths.mergedEventId} is not null`);
    expect(merged.length).toBe(fromLog.length);
    expect(merged.every((death) => death.cause !== null)).toBe(true);
    const questsDone = typed('quest.updated').filter(
      (event) => (event.data as { state: string }).state === 'Completed'
    );
    const featRows = await db.select().from(feats);
    expect(featRows.filter((row) => row.kind === 'quest').length).toBe(questsDone.length);
    expect(featRows.filter((row) => row.kind === 'build').length).toBe(
      typed('building.placed').length
    );
    expect(featRows.filter((row) => row.kind === 'craft').length).toBe(
      typed('item.crafted').length
    );
    expect(await count(chatMessages)).toBe(typed('chat.message').length);
    const unlocked = typed('journal.unlocked');
    const distinct = new Set(
      unlocked.map((event) => `${event.data.user_id}|${(event.data as { entry: string }).entry}`)
    );
    expect(await count(journalEntries)).toBe(distinct.size);
    const floods = await db
      .select()
      .from(events)
      .where(
        sql`${events.type} = 'journal.unlocked' and ${events.data}->>'entry' like 'JOURNAL_Know_Tutorials%'`
      );
    expect(floods.length).toBeGreaterThan(0);
    expect(floods.every((row) => row.quiet)).toBe(true);
    expect(await count(worldSaves)).toBe(typed('save.world').length);
    const lastRead = typed('save.read').at(-1)!.data as { character_guids: string[] };
    expect(await count(characterSaves)).toBe(lastRead.character_guids.length);
    expect(lastRead.character_guids.length).toBeGreaterThan(0);
    const online = await computeOnline(db);
    expect(online.players.map((player) => player.name).sort()).toEqual(
      history.onlineAtEnd.map((player) => player.name).sort()
    );
    expect(online.players.every((player) => player.platform === 'pc')).toBe(true);
    const status = await computeStatus(db);
    expect(status.state).toBe('online');
    expect(status.players.online).toBe(history.onlineAtEnd.length);
    expect(status.players.max).toBe(6);
    expect(status.players.observed_at).not.toBeNull();
    expect(status.process.memory_mb).toBeGreaterThan(900);
    expect(status.save.day).not.toBeNull();
    expect(status.collector.state).toBe('active');
    expect(status.collector.layers).toEqual({ logs: true, saves: true, process: true, mod: true });
    expect(status.stopping).toBe(false);
    const closed = await db
      .select()
      .from(sessions)
      .where(sql`${sessions.leftAt} is not null`);
    expect(closed.length).toBeGreaterThan(3);
    expect(closed.every((session) => (session.durationS ?? -1) >= 0)).toBe(true);
    expect(new Set(closed.map((session) => session.endReason)).has('left')).toBe(true);
    const runs = await db.select().from(collectorRuns).orderBy(asc(collectorRuns.startedAt));
    expect(runs.length).toBe(history.runs.length);
    const world = await getWorld(db);
    expect(world.save?.weather.length).toBe(3);
    expect(world.save?.progress?.defeated_bosses).toEqual(['ai_boss_velgar']);
    expect(world.save?.buildings).toEqual({
      total: 38,
      unfinished: 2,
      types: [{ id: 'sample-timber-wall', count: 38 }]
    });
    expect(world.save?.discoveries).toHaveLength(1);
    expect(world.save?.discoveries?.[0]?.characters).toBe(2);
    expect(world.totals.players).toBe(seen.size);
    expect(world.max_players).toBe(6);
  });

  it('shows what the save records about a character, never as live', async () => {
    const db = getDb();
    const [row] = await db.select().from(players).orderBy(asc(players.id)).limit(1);
    const detail = await getPlayer(db, row!.id, defaultSettings.features);
    expect(detail.character).not.toBeNull();
    expect(detail.character!.skills).toHaveLength(12);
    expect(detail.character!.skills.every((skill) => skill.level !== null)).toBe(true);
    expect(detail.character!.skills.map((skill) => skill.name)).toContain('Mining');
    expect(detail.character!.total_level).toBeGreaterThan(11);
    expect(detail.character!.journal.unlocked).toBeGreaterThan(0);
    expect(detail.chat_messages).toBeNull();
    expect(detail.feats).not.toBeNull();
    expect(JSON.stringify(detail)).not.toMatch(/[0-9a-f]{32}/);
  });

  it('stores unknown event types and flags invalid data without failing the batch', async () => {
    const at = new Date();
    const unknown = await send(envelope(history, 'boss.summoned', { boss: 'Velgar' }, at, 900_000));
    expect(unknown.accepted).toBe(1);
    expect(unknown.invalid).toBe(0);
    const invalid = await send(
      envelope(history, 'player.joined', { name: 'Nobody', source: 'log' }, at, 900_001)
    );
    expect(invalid.accepted).toBe(1);
    expect(invalid.invalid).toBe(1);
    const flagged = await getDb()
      .select()
      .from(events)
      .where(eq(events.type, 'player.joined'))
      .then((rows) => rows.filter((row) => row.invalid !== null));
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.invalid).toMatch(/user_id/);
  });

  it('marks a stop as saving, then stopping, until the server is offline', async () => {
    const db = getDb();
    const at = new Date(Date.now() - 60_000);
    await send(
      envelope(history, 'server.stopping', { by: 'collector', save: 'requested' }, at, 900_010)
    );
    expect((await computeStatus(db)).stopping).toBe(true);
    await send(
      envelope(
        history,
        'server.saved',
        { slot: 'magpie-test', ok: true },
        new Date(at.getTime() + 1000),
        900_011
      )
    );
    expect((await computeStatus(db)).save.saved_at).toBe(
      new Date(at.getTime() + 1000).toISOString()
    );
    await send(
      envelope(
        history,
        'server.offline',
        { reason: 'stopped' },
        new Date(at.getTime() + 2000),
        900_012
      )
    );
    const status = await computeStatus(db);
    expect(status.state).toBe('offline');
    expect(status.stopping).toBe(false);
    const open = await db.select().from(sessions).where(isNull(sessions.leftAt));
    expect(open).toHaveLength(0);
    await send(
      envelope(
        history,
        'server.online',
        history.server as unknown as Record<string, unknown>,
        new Date(at.getTime() + 3000),
        900_013
      )
    );
    expect((await computeStatus(db)).state).toBe('online');
  });

  it('ends the stopping state when the world save fails and shows it in the feed', async () => {
    const db = getDb();
    const at = new Date(Date.now() - 30_000);
    await send(
      envelope(history, 'server.stopping', { by: 'admin', save: 'requested' }, at, 900_014)
    );
    expect((await computeStatus(db)).stopping).toBe(true);
    const failed = envelope(
      history,
      'server.stopping',
      { by: 'admin', save: 'failed' },
      new Date(at.getTime() + 5000),
      900_015
    );
    await send(failed);
    const status = await computeStatus(db);
    expect(status.state).toBe('online');
    expect(status.stopping).toBe(false);
    const stored = await db.select().from(events).where(eq(events.id, failed.events[0]!.id));
    expect(stored[0]!.quiet).toBe(false);
  });

  it('closes the sessions of a lost collector', async () => {
    const db = getDb();
    const runId = history.runs[history.runs.length - 1]!.runId;
    const at = new Date();
    const wren = history.players[0]!;
    await send(
      envelope(
        history,
        'player.joined',
        {
          user_id: wren.userId,
          character_guid: wren.characterGuid,
          name: wren.name,
          platform: 'PC',
          source: 'log'
        },
        at,
        900_020
      )
    );
    expect((await computeStatus(db)).players.online).toBe(1);
    await db
      .update(collectorRuns)
      .set({ lastSeenAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(collectorRuns.runId, runId));
    const result = await runWatchdog(db, new Date(), new Date(0));
    expect(result.lostRuns).toEqual([runId]);
    expect(result.siteEvents.map((event) => event.type)).toEqual(['collector.lost']);
    const open = await db.select().from(sessions).where(isNull(sessions.leftAt));
    expect(open).toHaveLength(0);
    expect((await computeStatus(db)).state).toBe('unknown');
  });
});

describe('remote observation ingest', () => {
  it('projects only polling metadata and preserves the last successful check on an outage', async () => {
    const checked = '2026-09-28T12:00:00.000Z';
    const remote = {
      logs_poll_s: 5,
      saves_poll_s: 30,
      logs_checked_at: checked,
      saves_checked_at: checked
    };
    const data = {
      uptime_s: 30,
      queue_depth: 0,
      dropped_events: 0,
      logs: 'ok',
      saves: 'ok',
      process: 'off',
      mod: 'off',
      remote
    };
    expect(
      (await send(envelope(history, 'collector.heartbeat', data, new Date(), 901_000))).invalid
    ).toBe(0);
    expect((await computeStatus(getDb())).collector.remote).toEqual(remote);
    await send(
      envelope(
        history,
        'collector.heartbeat',
        { ...data, logs: 'error', saves: 'error' },
        new Date(),
        901_001
      )
    );
    expect((await computeStatus(getDb())).collector.remote).toEqual(remote);
  });
});

describe('saved clock and discoveries', () => {
  it('projects raw clock seconds and discoveries through signed ingest, retaining unknown values', async () => {
    const at = new Date(Date.now() + 60_000);
    const data = {
      saved_at: at.toISOString(),
      world_guid: history.server.world_guid,
      clock_seconds: 1800,
      discoveries: [{ id: 'unknown-place', characters: 2 }]
    };
    expect((await send(envelope(history, 'save.world', data, at, 902_000))).invalid).toBe(0);
    const world = await getWorld(getDb());
    expect(world.save).toMatchObject({ day: 1, time_of_day: 6, discoveries: data.discoveries });
    expect((await computeStatus(getDb())).save.day).toBe(1);
    const [stored] = await getDb()
      .select({ data: events.data })
      .from(events)
      .where(eq(events.seq, 902_000));
    expect(stored?.data).toMatchObject({ day: 1, time_of_day: 6, clock_seconds: 1800 });
    const midnight = new Date(at.getTime() + 1000);
    await send(
      envelope(
        history,
        'save.world',
        { ...data, saved_at: midnight.toISOString(), clock_seconds: 0, discoveries: [] },
        midnight,
        902_001
      )
    );
    expect((await getWorld(getDb())).save).toMatchObject({
      day: 0,
      time_of_day: 0,
      discoveries: []
    });
    const unknown = new Date(at.getTime() + 2000);
    await send(
      envelope(
        history,
        'save.world',
        { saved_at: unknown.toISOString(), world_guid: data.world_guid },
        unknown,
        902_002
      )
    );
    expect((await getWorld(getDb())).save).toMatchObject({
      day: null,
      time_of_day: null,
      discoveries: null
    });
  });
});

describe('rebuilding from the event log', () => {
  it('reproduces sessions, deaths, discoveries, chat and player totals', async () => {
    const db = getDb();
    const capture = async () => ({
      sessions: (
        await db
          .select({
            playerId: sessions.playerId,
            joinedAt: sessions.joinedAt,
            leftAt: sessions.leftAt,
            endReason: sessions.endReason,
            deaths: sessions.deaths
          })
          .from(sessions)
          .orderBy(asc(sessions.playerId), asc(sessions.joinedAt))
      ).map((row) => ({
        ...row,
        joinedAt: row.joinedAt.toISOString(),
        leftAt: row.leftAt?.toISOString() ?? null
      })),
      players: await db
        .select({
          id: players.id,
          sessions: players.sessions,
          deaths: players.deaths,
          chat: players.chatMessages,
          online: players.online,
          playtime: sql<number>`round(${players.playtimeS})::int`
        })
        .from(players)
        .orderBy(asc(players.id)),
      levelUps: (await db.select({ n: sql<number>`count(*)::int` }).from(levelUps))[0]!.n,
      deaths: (await db.select({ n: sql<number>`count(*)::int` }).from(deaths))[0]!.n,
      journal: (await db.select({ n: sql<number>`count(*)::int` }).from(journalEntries))[0]!.n,
      chat: (await db.select({ n: sql<number>`count(*)::int` }).from(chatMessages))[0]!.n,
      saves: (await db.select({ n: sql<number>`count(*)::int` }).from(characterSaves))[0]!.n,
      worldSaves: await db
        .select({
          day: worldSaves.day,
          hour: worldSaves.timeOfDay,
          discoveries: worldSaves.discoveries
        })
        .from(worldSaves)
        .orderBy(asc(worldSaves.savedAt))
    });
    const before = await capture();
    const result = await rebuildProjections(db);
    expect(result.replayed).toBeGreaterThan(100);
    const after = await capture();
    expect(after).toEqual(before);
  });
});
