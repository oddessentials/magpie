import { and, eq, sql } from 'drizzle-orm';
import { dawnMinute, daySeconds, duskMinute, minutesPerDay, readClock } from '$lib/world/clock';
import { getDb, type Database } from '../db/client';
import { events } from '../db/schema';
import { createContext, type StoredEvent } from '../ingest/context';
import { emitSiteEvent, type SiteEventType } from '../ingest/projections';
import { readServerState } from '../read/common';
import { computeStatus, latestRun } from '../read/status';

export const maxStepSeconds = 60;

export interface Herald {
  type: Extract<SiteEventType, 'world.dusk_approaching' | 'world.dawn_approaching'>;
  minute: number;
  lead: number;
}

export const heralds: readonly Herald[] = [
  { type: 'world.dusk_approaching', minute: duskMinute - 120, lead: 120 },
  { type: 'world.dawn_approaching', minute: dawnMinute - 30, lead: 30 }
];

const secondsPerMinute = daySeconds / minutesPerDay;

export function crossedMinute(previous: number, current: number, minute: number): number | null {
  const step = current - previous;
  if (!(step > 0) || step > maxStepSeconds) return null;
  const offset = minute * secondsPerMinute;
  const crossing = (Math.floor((previous - offset) / daySeconds) + 1) * daySeconds + offset;
  return crossing > previous && crossing <= current ? crossing : null;
}

interface Sample {
  world: string;
  seconds: number;
}

export interface Heralds {
  tick(now?: Date): Promise<StoredEvent[]>;
  reset(): void;
}

export function createHeralds(db: Database = getDb()): Heralds {
  let previous: Sample | null = null;

  async function announced(type: Herald['type'], world: string, day: number): Promise<boolean> {
    const rows = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.type, type),
          sql`${events.data}->>'world_guid' = ${world}`,
          sql`(${events.data}->>'day')::int = ${day}`
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  return {
    async tick(now = new Date()): Promise<StoredEvent[]> {
      const [status, state] = await Promise.all([computeStatus(db, now), readServerState(db)]);
      const clock = status.save.clock;
      const reading = clock ? readClock(status, now.getTime()) : null;
      const world = state?.worldGuid ?? null;
      if (!clock || !reading || reading.state !== 'live' || !world) {
        previous = null;
        return [];
      }
      const sample: Sample = { world, seconds: reading.seconds };
      const last = previous;
      previous = sample;
      if (!last || last.world !== world) return [];
      const emitted: StoredEvent[] = [];
      for (const herald of heralds) {
        const crossing = crossedMinute(last.seconds, sample.seconds, herald.minute);
        if (crossing === null) continue;
        const day = Math.floor(crossing / daySeconds);
        if (await announced(herald.type, world, day)) continue;
        const run = await latestRun(db);
        if (!run) continue;
        const at = new Date(now.getTime() - ((sample.seconds - crossing) / clock.rate) * 1000);
        const leadSeconds = (herald.lead * secondsPerMinute) / clock.rate;
        await db.transaction(async (tx) => {
          const ctx = createContext(tx, now);
          await emitSiteEvent(ctx, herald.type, at, run.runId, run.lastSeq, {
            world_guid: world,
            day,
            turn_at: new Date(at.getTime() + leadSeconds * 1000).toISOString(),
            turn_in_s: Math.round(leadSeconds)
          });
          emitted.push(...ctx.effects.siteEvents);
        });
      }
      return emitted;
    },
    reset() {
      previous = null;
    }
  };
}

let instance: Heralds | null = null;

export function clockHeralds(): Heralds {
  if (!instance) instance = createHeralds();
  return instance;
}
