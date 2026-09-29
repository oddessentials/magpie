import { createHash, randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { IngestBatch, IngestResult } from '../../src/lib/api/types';
import { getDb } from '../../src/lib/server/db/client';
import { deaths, events, journalEntries, players, sessions } from '../../src/lib/server/db/schema';
import { computeOnline } from '../../src/lib/server/read/status';
import { POST as ingest } from '../../src/routes/api/ingest/+server';
import { resetDatabase, routeEvent, signedRequest, useTestDatabase } from './setup';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const runId = randomUUID();
let seq = 0;

async function send(type: string, data: Record<string, unknown>, at: Date): Promise<void> {
  seq += 1;
  const batch = {
    collector: { name: 'magpie-collector', version: '0.1.0', run_id: runId },
    server: {
      name: 'Presence test',
      version: '1.0.0.5',
      world_name: 'presence',
      world_guid: 'C0FFEE00000000000000000000000001'
    },
    events: [{ id: randomUUID(), seq, run_id: runId, ts: at.toISOString(), type, data }]
  } as IngestBatch;
  const response = await ingest(routeEvent(signedRequest(batch)));
  expect(response.status).toBe(200);
  const result = (await response.json()) as IngestResult;
  expect(result.invalid).toBe(0);
}

function person(name: string) {
  const userId = createHash('sha256').update(`account-${name}`).digest('hex').slice(0, 32);
  const characterGuid = createHash('sha256')
    .update(`character-${name}`)
    .digest('hex')
    .slice(0, 32)
    .toUpperCase();
  return {
    userId,
    characterGuid,
    name,
    joined: () => ({
      user_id: userId,
      character_guid: characterGuid,
      name,
      platform: 'PC',
      source: 'log'
    }),
    left: () => ({
      user_id: userId,
      character_guid: characterGuid,
      name,
      saved: true,
      source: 'log'
    }),
    byGuid: () => ({ user_id: null, character_guid: characterGuid, name })
  };
}

async function playerOf(userId: string) {
  const rows = await getDb().select().from(players).where(eq(players.userId, userId));
  return rows[0] ?? null;
}

const second = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);

beforeAll(async () => {
  useTestDatabase();
  await resetDatabase();
  await send(
    'server.online',
    { name: 'Presence test', world_name: 'presence' },
    new Date(Date.now() - 3600_000)
  );
});

describe('player presence from the log', () => {
  it('opens a session on the entered-world line and closes it on the leave', async () => {
    const wren = person('Wren');
    const t0 = new Date(Date.now() - 20 * 60_000);
    await send('player.joined', wren.joined(), t0);
    await send('player.joined', wren.joined(), second(t0, 5));
    const online = await computeOnline(getDb());
    expect(online.players.map((player) => player.name)).toEqual(['Wren']);
    expect(online.players[0]!.platform).toBe('pc');
    expect(online.observed_at).toBe(second(t0, 5).toISOString());
    await send('player.left', wren.left(), second(t0, 600));
    const player = (await playerOf(wren.userId))!;
    expect(player.online).toBe(false);
    expect(player.sessions).toBe(1);
    expect(Math.round(player.playtimeS)).toBe(600);
    const rows = await getDb().select().from(sessions).where(eq(sessions.playerId, player.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'log', endReason: 'left' });
    const joins = await getDb()
      .select()
      .from(events)
      .where(eq(events.type, 'player.joined'))
      .orderBy(asc(events.ts));
    expect(joins.map((row) => row.quiet)).toEqual([false, true]);
  });

  it('merges a log death with the mod death, marks the player down until the respawn', async () => {
    const moss = person('Moss');
    const t1 = new Date(Date.now() - 10 * 60_000);
    await send('player.joined', moss.joined(), t1);
    await send(
      'player.died',
      { ...moss.byGuid(), x: 8233.6, y: 170681.8, z: -1276.6, source: 'log' },
      second(t1, 60)
    );
    expect((await computeOnline(getDb())).players.find((p) => p.name === 'Moss')?.down).toBe(true);
    await send(
      'player.died',
      { ...moss.byGuid(), source: 'mod', cause: 'combat', killer: 'a chicken' },
      second(t1, 61)
    );
    const player = (await playerOf(moss.userId))!;
    expect(player.deaths).toBe(1);
    const rows = await getDb().select().from(deaths).where(eq(deaths.playerId, player.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'log',
      killer: 'a chicken',
      cause: 'combat',
      x: 8233.6
    });
    expect(rows[0]!.mergedEventId).not.toBeNull();
    await send('player.respawned', moss.byGuid(), second(t1, 80));
    expect((await computeOnline(getDb())).players.find((p) => p.name === 'Moss')?.down).toBe(false);
    const modDeath = await getDb()
      .select()
      .from(events)
      .where(eq(events.type, 'player.died'))
      .then((all) => all.filter((row) => (row.data as { source: string }).source === 'mod'));
    expect(modDeath.every((row) => row.quiet)).toBe(true);
  });

  it('keeps journal unlocks once per player and quiets the login flood', async () => {
    const fern = person('Fern');
    const t2 = new Date(Date.now() - 5 * 60_000);
    await send('player.joined', fern.joined(), t2);
    await send(
      'journal.unlocked',
      { ...fern.byGuid(), entry: 'JOURNAL_Know_Tutorials_Movement' },
      second(t2, 2)
    );
    await send(
      'journal.unlocked',
      { ...fern.byGuid(), entry: 'JOURNAL_World_Fauna_Chicken' },
      second(t2, 120)
    );
    await send(
      'journal.unlocked',
      { ...fern.byGuid(), entry: 'JOURNAL_World_Fauna_Chicken' },
      second(t2, 130)
    );
    await send(
      'journal.unlocked',
      { user_id: null, character_guid: null, name: null, entry: 'JOURNAL_World_Fauna_Kebbit' },
      second(t2, 140)
    );
    const player = (await playerOf(fern.userId))!;
    const entries = await getDb()
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.playerId, player.id));
    expect(entries.map((row) => row.entry).sort()).toEqual([
      'JOURNAL_Know_Tutorials_Movement',
      'JOURNAL_World_Fauna_Chicken'
    ]);
    const rows = await getDb()
      .select()
      .from(events)
      .where(eq(events.type, 'journal.unlocked'))
      .orderBy(asc(events.ts));
    expect(rows.map((row) => [row.playerId !== null, row.quiet])).toEqual([
      [true, true],
      [true, false],
      [true, true],
      [false, true]
    ]);
  });

  it('links mod events to the player by character guid and leaves unknown characters unlinked', async () => {
    const fern = person('Fern');
    const t3 = new Date(Date.now() - 2 * 60_000);
    await send('skill.level_up', { ...fern.byGuid(), skill: 'ABCDEF12', level: 4 }, t3);
    await send(
      'chat.message',
      {
        user_id: null,
        character_guid: 'DCFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        name: 'Ghost',
        channel: 'global',
        text: 'hello?'
      },
      second(t3, 1)
    );
    const player = (await playerOf(fern.userId))!;
    const rows = await getDb().select().from(events).where(eq(events.type, 'skill.level_up'));
    expect(rows[0]!.playerId).toBe(player.id);
    expect(rows[0]!.quiet).toBe(false);
    const ghost = await getDb().select().from(events).where(eq(events.type, 'chat.message'));
    expect(ghost[0]!.playerId).toBeNull();
    expect(await playerOf('DCFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBeNull();
  });
});
