import { and, asc, eq, getTableName, gt, or, sql } from 'drizzle-orm';
import { getDb, type Database } from '../db/client';
import { events, players, projectionTables, serverState } from '../db/schema';
import { createContext, type StoredEvent, type Tx } from '../ingest/context';
import { lockProjections } from '../ingest/ingest';
import { applyEvent, markEvent } from '../ingest/projections';

interface Cursor {
  ts: Date;
  seq: number;
  id: string;
}

async function nextChunk(tx: Tx, cursor: Cursor | null, size: number) {
  const after = cursor
    ? or(
        gt(events.ts, cursor.ts),
        and(eq(events.ts, cursor.ts), gt(events.seq, cursor.seq)),
        and(eq(events.ts, cursor.ts), eq(events.seq, cursor.seq), gt(events.id, cursor.id))
      )
    : undefined;
  return tx
    .select()
    .from(events)
    .where(after)
    .orderBy(asc(events.ts), asc(events.seq), asc(events.id))
    .limit(size);
}

export async function rebuildProjections(
  db: Database = getDb(),
  onProgress?: (done: number, total: number) => Promise<void> | void
): Promise<{ replayed: number }> {
  return db.transaction(async (tx) => {
    await lockProjections(tx);
    const totals = await tx.select({ count: sql<number>`count(*)::int` }).from(events);
    const total = totals[0]?.count ?? 0;
    for (const table of projectionTables) {
      await tx.execute(sql`delete from ${table}`);
      await tx.execute(
        sql.raw(`alter sequence if exists "${getTableName(table)}_id_seq" restart with 1`)
      );
    }
    await tx.update(players).set({
      online: false,
      dead: false,
      currentSessionId: null,
      playtimeS: 0,
      sessions: 0,
      deaths: 0,
      chatMessages: 0
    });
    await tx.update(serverState).set({
      online: false,
      onlineSince: null,
      offlineSince: null,
      stoppingAt: null,
      presenceAt: null,
      saveAt: null,
      saveDay: null
    });
    await tx.update(events).set({ playerId: null, quiet: false });
    const ctx = createContext(tx, new Date(), true);
    let cursor: Cursor | null = null;
    let replayed = 0;
    for (;;) {
      const chunk = await nextChunk(tx, cursor, 500);
      if (chunk.length === 0) break;
      for (const row of chunk) {
        replayed += 1;
        if (row.invalid !== null) continue;
        const event: StoredEvent = {
          id: row.id,
          seq: row.seq,
          run_id: row.runId,
          ts: row.ts.toISOString(),
          type: row.type,
          data: row.data as Record<string, unknown>,
          source: row.source === 'site' ? 'site' : 'collector'
        };
        ctx.receivedAt = row.receivedAt;
        await markEvent(ctx, row.id, await applyEvent(ctx, event));
      }
      const last = chunk[chunk.length - 1]!;
      cursor = { ts: last.ts, seq: last.seq, id: last.id };
      if (onProgress) await onProgress(replayed, total);
    }
    return { replayed };
  });
}
