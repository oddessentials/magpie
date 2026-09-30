import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { IngestBatch, IngestResult } from '../../src/lib/api/types';
import { getDb } from '../../src/lib/server/db/client';
import { events } from '../../src/lib/server/db/schema';
import { createHeralds } from '../../src/lib/server/jobs/heralds';
import { rebuildProjections } from '../../src/lib/server/jobs/rebuild';
import { buildActivityItems } from '../../src/lib/server/read/activity';
import { computeStatus } from '../../src/lib/server/read/status';
import { POST as ingest } from '../../src/routes/api/ingest/+server';
import { resetDatabase, routeEvent, signedRequest, useTestDatabase } from './setup';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const runId = randomUUID();
const world = 'C0FFEE00000000000000000000000002';
let seq = 0;

async function send(type: string, data: Record<string, unknown>, at: Date): Promise<void> {
  seq += 1;
  const batch = {
    collector: { name: 'magpie-collector', version: '0.1.0', run_id: runId },
    server: {
      name: 'Herald test',
      version: '1.0.0.6',
      world_name: 'heralds',
      world_guid: world
    },
    events: [{ id: randomUUID(), seq, run_id: runId, ts: at.toISOString(), type, data }]
  } as IngestBatch;
  const response = await ingest(routeEvent(signedRequest(batch)));
  expect(response.status).toBe(200);
  expect(((await response.json()) as IngestResult).invalid).toBe(0);
}

const later = (base: Date, ms: number) => new Date(base.getTime() + ms);
const saved = new Date(Date.now() + 60_000);

beforeAll(async () => {
  useTestDatabase();
  await resetDatabase();
  await send(
    'server.online',
    { name: 'Herald test', world_name: 'heralds' },
    later(saved, -3_600_000)
  );
  await send(
    'save.world',
    { saved_at: saved.toISOString(), world_guid: world, clock_seconds: 7 * 1440 + 19 * 60 + 58 },
    saved
  );
});

describe('the nightfall and dawn warnings', () => {
  it('warn once per world day as the running clock passes 20:00', async () => {
    const db = getDb();
    expect((await computeStatus(db, saved)).state).toBe('online');
    const heralds = createHeralds(db);
    expect(await heralds.tick(later(saved, 1000))).toEqual([]);
    const [warning, ...rest] = await heralds.tick(later(saved, 6000));
    expect(rest).toEqual([]);
    expect(warning).toMatchObject({
      type: 'world.dusk_approaching',
      source: 'site',
      ts: later(saved, 2000).toISOString()
    });
    expect(warning!.data).toEqual({
      world_guid: world,
      day: 7,
      turn_at: later(saved, 122_000).toISOString(),
      turn_in_s: 120
    });
    expect(await heralds.tick(later(saved, 11_000))).toEqual([]);
    const restarted = createHeralds(db);
    await restarted.tick(later(saved, 1000));
    expect(await restarted.tick(later(saved, 6000))).toEqual([]);
    const rows = await db.select().from(events).where(eq(events.type, 'world.dusk_approaching'));
    expect(rows).toHaveLength(1);
    const [item] = await buildActivityItems(db, rows);
    expect(item).toMatchObject({
      type: 'world.dusk_approaching',
      player: null,
      details: { turn_at: later(saved, 122_000).toISOString(), turn_in_s: 120 }
    });
  });

  it('stay in the feed through a rebuild and stay quiet while the server is down', async () => {
    const db = getDb();
    await rebuildProjections(db);
    const rows = await db.select().from(events).where(eq(events.type, 'world.dusk_approaching'));
    expect(rows.map((row) => row.quiet)).toEqual([false]);
    await send('server.offline', { reason: 'stopped' }, later(saved, 20_000));
    const heralds = createHeralds(db);
    expect(await heralds.tick(later(saved, 21_000))).toEqual([]);
    expect(await heralds.tick(later(saved, 26_000))).toEqual([]);
  });
});
