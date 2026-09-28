import { and, desc, eq, isNull, lt, or, type SQL } from 'drizzle-orm';
import type { Database } from '../db/client';
import { chatMessages, players } from '../db/schema';
import type { KeysetPage } from '../http/respond';
import { chatChannel, playerRef, type Schemas } from './common';

export type ChatItem = Schemas['ChatItem'];

export async function listChat(db: Database, page: KeysetPage): Promise<ChatItem[]> {
  const conditions: SQL[] = [or(isNull(chatMessages.playerId), eq(players.hidden, false))!];
  const after = page.after;
  if (after) {
    conditions.push(
      or(
        lt(chatMessages.at, after.ts),
        and(eq(chatMessages.at, after.ts), lt(chatMessages.eventId, after.id))
      )!
    );
  }
  const rows = await db
    .select({ message: chatMessages, player: players })
    .from(chatMessages)
    .leftJoin(players, eq(players.id, chatMessages.playerId))
    .where(and(...conditions))
    .orderBy(desc(chatMessages.at), desc(chatMessages.eventId))
    .limit(page.limit + 1);
  return rows.map(({ message, player }) => ({
    id: message.eventId,
    ts: message.at.toISOString(),
    player: player ? playerRef(player) : null,
    name: player ? playerRef(player).name : message.name,
    channel: chatChannel(message.channel),
    text: message.text
  }));
}
