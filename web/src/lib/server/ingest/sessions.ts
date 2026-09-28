import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  players,
  sessions,
  type PlayerRow,
  type SessionEndReason,
  type SessionRow
} from '../db/schema';
import { updatePlayer, type ProjectionContext } from './context';

export type SessionSource = 'log';

export async function openSessionOf(
  ctx: ProjectionContext,
  player: PlayerRow
): Promise<SessionRow | null> {
  if (player.currentSessionId === null) return null;
  const rows = await ctx.tx
    .select()
    .from(sessions)
    .where(eq(sessions.id, player.currentSessionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function openSession(
  ctx: ProjectionContext,
  player: PlayerRow,
  at: Date,
  source: SessionSource,
  runId: string,
  joinEventId: string | null
): Promise<boolean> {
  const current = await openSessionOf(ctx, player);
  if (current) {
    if (at < current.joinedAt) {
      await ctx.tx.update(sessions).set({ joinedAt: at }).where(eq(sessions.id, current.id));
    }
    return false;
  }
  const inserted = await ctx.tx
    .insert(sessions)
    .values({ playerId: player.id, runId, joinedAt: at, source, joinEventId })
    .returning({ id: sessions.id });
  await updatePlayer(ctx, player, {
    online: true,
    dead: false,
    currentSessionId: inserted[0]!.id,
    sessions: sql`${players.sessions} + 1`,
    lastSeen: player.lastSeen > at ? player.lastSeen : at
  });
  ctx.effects.onlineChanged = true;
  return true;
}

export async function closeSession(
  ctx: ProjectionContext,
  player: PlayerRow,
  at: Date,
  reason: SessionEndReason,
  leftEventId: string | null
): Promise<boolean> {
  const current = await openSessionOf(ctx, player);
  if (!current) {
    if (player.online || player.currentSessionId !== null) {
      await updatePlayer(ctx, player, { online: false, dead: false, currentSessionId: null });
      ctx.effects.onlineChanged = true;
    }
    return false;
  }
  const leftAt = at > current.joinedAt ? at : current.joinedAt;
  const durationS = (leftAt.getTime() - current.joinedAt.getTime()) / 1000;
  await ctx.tx
    .update(sessions)
    .set({ leftAt, durationS, endReason: reason, leftEventId })
    .where(eq(sessions.id, current.id));
  await updatePlayer(ctx, player, {
    online: false,
    dead: false,
    currentSessionId: null,
    playtimeS: sql`${players.playtimeS} + ${durationS}`,
    lastSeen: player.lastSeen > leftAt ? player.lastSeen : leftAt
  });
  ctx.effects.onlineChanged = true;
  return true;
}

export async function playersWithOpenSessions(ctx: ProjectionContext): Promise<PlayerRow[]> {
  const rows = await ctx.tx.select().from(players).where(isNotNull(players.currentSessionId));
  return rows.map((row) => {
    const cached = ctx.players.get(row.userId);
    if (cached) {
      Object.assign(cached, row);
      return cached;
    }
    ctx.players.set(row.userId, row);
    return row;
  });
}

export async function closeAllSessions(
  ctx: ProjectionContext,
  at: Date,
  reason: SessionEndReason
): Promise<number> {
  let closed = 0;
  for (const player of await playersWithOpenSessions(ctx)) {
    if (await closeSession(ctx, player, at, reason, null)) closed += 1;
  }
  const stray = await ctx.tx
    .update(players)
    .set({ online: false, dead: false })
    .where(and(eq(players.online, true), isNull(players.currentSessionId)))
    .returning({ id: players.id });
  if (stray.length > 0) {
    const ids = new Set(stray.map((row) => row.id));
    for (const player of ctx.players.values()) {
      if (ids.has(player.id)) {
        player.online = false;
        player.dead = false;
      }
    }
    ctx.effects.onlineChanged = true;
  }
  return closed;
}

export async function bumpSessionCounter(
  ctx: ProjectionContext,
  player: PlayerRow,
  column: 'deaths',
  amount = 1
): Promise<void> {
  if (player.currentSessionId === null) return;
  await ctx.tx
    .update(sessions)
    .set({ [column]: sql`${sessions[column]} + ${amount}` })
    .where(eq(sessions.id, player.currentSessionId));
}

export async function sessionJoinedAt(
  ctx: ProjectionContext,
  player: PlayerRow
): Promise<Date | null> {
  const current = await openSessionOf(ctx, player);
  return current?.joinedAt ?? null;
}
