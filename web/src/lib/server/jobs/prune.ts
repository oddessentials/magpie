import { lt, sql } from 'drizzle-orm';
import { getDb, type Database } from '../db/client';
import { ingestBatches, jobs, serverMetrics, statusSamples, worldSaves } from '../db/schema';
import { pruneSessions } from '../auth/admin';
import { siteSettings, type Retention } from '../settings';

export const fixedRetention = {
  ingestBatchesDays: 7,
  jobsDays: 30
} as const;

export interface PruneResult {
  serverMetrics: number;
  statusSamples: number;
  worldSaves: number;
  ingestBatches: number;
  jobs: number;
  adminSessions: number;
}

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 24 * 3600 * 1000);

export async function runPrune(
  db: Database = getDb(),
  now = new Date(),
  retention?: Retention
): Promise<PruneResult> {
  const keep = retention ?? (await siteSettings.read(db)).retention;
  const deletedMetrics = await db
    .delete(serverMetrics)
    .where(lt(serverMetrics.ts, daysAgo(now, keep.metrics_days)))
    .returning({ ts: serverMetrics.ts });
  const deletedSamples = await db
    .delete(statusSamples)
    .where(lt(statusSamples.ts, daysAgo(now, keep.status_samples_days)))
    .returning({ ts: statusSamples.ts });
  const deletedSaves = await db
    .delete(worldSaves)
    .where(
      sql`${worldSaves.savedAt} < ${daysAgo(now, keep.world_saves_days).toISOString()}::timestamptz and ${worldSaves.savedAt} < (select max(${worldSaves.savedAt}) from ${worldSaves})`
    )
    .returning({ savedAt: worldSaves.savedAt });
  const deletedBatches = await db
    .delete(ingestBatches)
    .where(lt(ingestBatches.receivedAt, daysAgo(now, fixedRetention.ingestBatchesDays)))
    .returning({ id: ingestBatches.id });
  const deletedJobs = await db
    .delete(jobs)
    .where(lt(jobs.createdAt, daysAgo(now, fixedRetention.jobsDays)))
    .returning({ id: jobs.id });
  return {
    serverMetrics: deletedMetrics.length,
    statusSamples: deletedSamples.length,
    worldSaves: deletedSaves.length,
    ingestBatches: deletedBatches.length,
    jobs: deletedJobs.length,
    adminSessions: await pruneSessions()
  };
}
