import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { IngestBatch, IngestResult } from '../../src/lib/api/types';
import { getDb } from '../../src/lib/server/db/client';
import { characterSaves } from '../../src/lib/server/db/schema';
import { characterOf } from '../../src/lib/server/read/saves';
import { POST as ingest } from '../../src/routes/api/ingest/+server';
import { resetDatabase, routeEvent, signedRequest, useTestDatabase } from './setup';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const guid = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';

beforeAll(async () => {
  useTestDatabase();
  await resetDatabase();
});

describe('saved quest states', () => {
  it('count the numbered and named completed states as done', async () => {
    const runId = randomUUID();
    const batch = {
      collector: { name: 'magpie-collector', version: '0.1.0', run_id: runId },
      server: null,
      events: [
        {
          id: randomUUID(),
          seq: 1,
          run_id: runId,
          ts: '2026-09-29T12:00:00.000Z',
          type: 'save.player',
          data: {
            saved_at: '2026-09-29T12:00:00.000Z',
            character_guid: guid,
            user_id: null,
            name: 'Quester',
            skills: [],
            quests: [
              { id: 'a', state: '2', objective: null },
              { id: 'b', state: 'completed', objective: null },
              { id: 'c', state: 'complete', objective: null },
              { id: 'd', state: 'given', objective: 'Find the temple' },
              { id: 'e', state: '1', objective: null }
            ]
          }
        }
      ]
    } as unknown as IngestBatch;
    const response = await ingest(routeEvent(signedRequest(batch)));
    expect(response.status).toBe(200);
    expect(((await response.json()) as IngestResult).invalid).toBe(0);
    const rows = await getDb()
      .select()
      .from(characterSaves)
      .where(eq(characterSaves.characterGuid, guid));
    expect(characterOf(rows[0])?.quests).toEqual({ active: 2, completed: 3 });
  });
});
