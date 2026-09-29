import { lt, sql } from 'drizzle-orm';
import { getDb, type Database } from '../db/client';
import {
  characterSkillSamples,
  ingestBatches,
  jobs,
  serverMetrics,
  statusSamples,
  worldSaves
} from '../db/schema';
import { pruneSessions } from '../auth/admin';
import { siteSettings, type Retention } from '../settings';

export const fixedRetention = {
  ingestBatchesDays: 7,
  jobsDays: 30,
  skillSamplesDays: 90
} as const;

export interface PruneResult {
  serverMetrics: number;
  statusSamples: number;
  worldSaves: number;
  skillSamples: number;
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
  const samplesBefore = daysAgo(now, fixedRetention.skillSamplesDays).toISOString();
  const deletedSkillSamples = await db
    .delete(characterSkillSamples)
    .where(
      sql`${characterSkillSamples.savedAt} < ${samplesBefore}::timestamptz and ${characterSkillSamples.savedAt} < (select max(kept.saved_at) from character_skill_samples as kept where kept.character_guid = ${characterSkillSamples.characterGuid} and kept.saved_at < ${samplesBefore}::timestamptz)`
    )
    .returning({ savedAt: characterSkillSamples.savedAt });
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
    skillSamples: deletedSkillSamples.length,
    ingestBatches: deletedBatches.length,
    jobs: deletedJobs.length,
    adminSessions: await pruneSessions()
  };
}
