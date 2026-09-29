import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { beforeAll, expect, it } from 'vitest';
import type { IngestBatch, IngestResult } from '../../src/lib/api/types';
import { getDb } from '../../src/lib/server/db/client';
import { deaths, events, feats, levelUps, players } from '../../src/lib/server/db/schema';
import { rebuildProjections } from '../../src/lib/server/jobs/rebuild';
import { getWorld } from '../../src/lib/server/read/world';
import { POST } from '../../src/routes/api/ingest/+server';
import { resetDatabase, routeEvent, seededHistory, signedRequest, useTestDatabase } from './setup';
import recorded from './fixtures/mod-events-25501739.json';

beforeAll(async () => {
  useTestDatabase();
  await resetDatabase();
});

it('ingests production Lua → collector fixtures, counts only outcomes and replays idempotently', async () => {
  const history = seededHistory(1);
  const runId = recorded[0]!.run_id;
  const joined = {
    id: randomUUID(),
    seq: 1,
    run_id: runId,
    ts: recorded[0]!.ts,
    type: 'player.joined',
    data: { user_id: '00000000000000000000000000000017', name: 'Magpie Fixture', platform: 'pc' }
  };
  const batch = {
    collector: { name: 'magpie-collector', version: '0.1.0', run_id: runId },
    server: history.server,
    events: [joined, ...recorded.map((entry) => ({ ...entry, seq: entry.seq + 1 }))]
  } as IngestBatch;
  const send = async () => {
    const response = await POST(routeEvent(signedRequest(batch)));
    expect(response.status).toBe(200);
    return (await response.json()) as IngestResult;
  };
  const first = await send();
  expect(first.accepted).toBe(batch.events.length);
  const replay = await send();
  expect(replay.accepted).toBe(0);
  expect(replay.duplicates).toBe(batch.events.length);
  const db = getDb();
  const [death] = await db.select().from(deaths);
  expect(death).toMatchObject({ x: 125.5, y: -300, z: 4, cause: 'Melee', killer: 'FixtureBoar' });
  expect(await db.select().from(deaths)).toHaveLength(1);
  expect(await db.select().from(levelUps)).toHaveLength(1);
  const outcomes = await db.select().from(feats).orderBy(asc(feats.kind));
  expect(outcomes.map((row) => [row.kind, row.subject])).toEqual([
    ['build', 'piece:42'],
    ['craft', 'UnknownRecipe'],
    ['quest', 'NewQuest']
  ]);
  const [xp] = await db.select().from(events).where(eq(events.type, 'player.xp'));
  expect(xp!.data).toMatchObject({ xp: 250, delta: 75, skill: 'UnknownSkill' });
  expect(await db.select().from(players)).toHaveLength(1);
  const before = await getWorld(db);
  expect(before.totals.deaths).toBe(1);
  expect(before.totals.quests_completed).toBe(1);
  await rebuildProjections(db);
  expect((await getWorld(db)).totals).toEqual(before.totals);
  expect((await db.select().from(feats)).map((row) => row.eventId).sort()).toEqual(
    outcomes.map((row) => row.eventId).sort()
  );
  expect(JSON.stringify(before)).not.toContain('00000000000000000000000000000017');
});
