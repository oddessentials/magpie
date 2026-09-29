import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/lib/server/db/client';
import {
  characterSkillSamples,
  serverMetrics,
  statusSamples,
  worldSaves
} from '../../src/lib/server/db/schema';
import { runPrune } from '../../src/lib/server/jobs/prune';
import { defaultSettings, siteSettings } from '../../src/lib/server/settings';
import { resetDatabase, useTestDatabase } from './setup';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const now = new Date('2026-09-28T06:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

beforeAll(async () => {
  useTestDatabase();
  await resetDatabase();
  const db = getDb();
  await db.insert(serverMetrics).values(
    [40, 20].map((days) => ({
      ts: daysAgo(days),
      memoryMb: 950,
      uptimeS: 60,
      players: 1,
      maxPlayers: 6
    }))
  );
  await db
    .insert(statusSamples)
    .values([100, 50].map((days) => ({ ts: daysAgo(days), state: 'online' as const, players: 1 })));
  await db.insert(worldSaves).values(
    [60, 45, 35].map((days) => ({
      savedAt: daysAgo(days),
      worldGuid: 'W',
      weather: [],
      events: []
    }))
  );
  await db.insert(characterSkillSamples).values([
    ...[200, 120, 100, 10].map((days) => ({
      characterGuid: 'A'.repeat(32),
      savedAt: daysAgo(days),
      skills: [{ id: 'skill', xp: 1000 - days }]
    })),
    { characterGuid: 'B'.repeat(32), savedAt: daysAgo(150), skills: [{ id: 'skill', xp: 5 }] }
  ]);
});

const count = async (table: typeof serverMetrics | typeof statusSamples | typeof worldSaves) =>
  (
    await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
  )[0]!.n;

describe('retention', () => {
  it('prunes by the defaults and always keeps the latest world save', async () => {
    const result = await runPrune(getDb(), now);
    expect(result.serverMetrics).toBe(1);
    expect(await count(serverMetrics)).toBe(1);
    expect(result.statusSamples).toBe(1);
    expect(await count(statusSamples)).toBe(1);
    expect(result.worldSaves).toBe(2);
    expect(await count(worldSaves)).toBe(1);
    expect(result.skillSamples).toBe(2);
    const kept = await getDb()
      .select({ guid: characterSkillSamples.characterGuid, at: characterSkillSamples.savedAt })
      .from(characterSkillSamples);
    expect(
      kept
        .map(
          (row) => `${row.guid[0]}:${Math.round((now.getTime() - row.at.getTime()) / 86_400_000)}`
        )
        .sort()
    ).toEqual(['A:10', 'A:100', 'B:150']);
  });

  it('follows the periods the admin sets', async () => {
    await siteSettings.write({ retention: { metrics_days: 7 } });
    const stored = await siteSettings.read();
    expect(stored.retention).toEqual({ ...defaultSettings.retention, metrics_days: 7 });
    const result = await runPrune(getDb(), now);
    expect(result.serverMetrics).toBe(1);
    expect(await count(serverMetrics)).toBe(0);
  });
});
