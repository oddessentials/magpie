import { eq, inArray } from 'drizzle-orm';
import type { components } from '$lib/api/types';
import type { Database } from '../db/client';
import { players, serverState, type PlayerRow, type ServerStateRow } from '../db/schema';
import { serverStateId } from '../ingest/context';

export type Schemas = components['schemas'];
export type PlayerRef = Schemas['PlayerRef'];
export type Platform = Schemas['Platform'];
export type ChatChannel = Schemas['ChatChannel'];

export function displayName(row: Pick<PlayerRow, 'name' | 'nameOverride'>): string {
  return row.nameOverride ?? row.name;
}

export function playerRef(row: Pick<PlayerRow, 'id' | 'name' | 'nameOverride'>): PlayerRef {
  return { id: row.id, name: displayName(row) };
}

export function platformName(value: string | null | undefined): Platform {
  const trimmed = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 32) : '';
  return trimmed === '' ? 'other' : trimmed;
}

export function chatChannel(raw: string): ChatChannel {
  switch (raw.toLowerCase()) {
    case 'global':
      return 'global';
    case 'direct':
      return 'direct';
    default:
      return 'other';
  }
}

export async function readServerState(db: Database): Promise<ServerStateRow | null> {
  const rows = await db.select().from(serverState).where(eq(serverState.id, serverStateId));
  return rows[0] ?? null;
}

export async function playersById(
  db: Database,
  ids: (number | null)[]
): Promise<Map<number, PlayerRow>> {
  const wanted = [...new Set(ids.filter((id): id is number => typeof id === 'number'))];
  if (wanted.length === 0) return new Map();
  const rows = await db.select().from(players).where(inArray(players.id, wanted));
  return new Map(rows.map((row) => [row.id, row]));
}

export function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / 1000);
}

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
