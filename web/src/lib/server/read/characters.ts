import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  characterSaves,
  characterUnlocks,
  journalEntries,
  players,
  type CharacterSaveRow,
  type CharacterUnlockRow,
  type PlayerRow
} from '../db/schema';
import type { UnlockKind } from '../ingest/saves';
import { displayName } from './common';
import { journalById, journalOf } from './lookup';

export interface SavedCharacter {
  player: PlayerRow;
  save: CharacterSaveRow;
}

export async function savedCharacters(db: Database): Promise<SavedCharacter[]> {
  const [visible, saves] = await Promise.all([
    db.select().from(players).where(eq(players.hidden, false)),
    db.select().from(characterSaves).where(isNull(characterSaves.goneAt))
  ]);
  const byGuid = new Map(saves.map((save) => [save.characterGuid, save]));
  const byUser = new Map<string, CharacterSaveRow>();
  for (const save of saves) {
    if (!save.userId) continue;
    const known = byUser.get(save.userId);
    if (!known || save.savedAt > known.savedAt) byUser.set(save.userId, save);
  }
  const used = new Set<string>();
  const out: SavedCharacter[] = [];
  for (const player of visible) {
    const save =
      (player.characterGuid ? byGuid.get(player.characterGuid) : undefined) ??
      (player.userId ? byUser.get(player.userId) : undefined);
    if (save && !used.has(save.characterGuid)) {
      used.add(save.characterGuid);
      out.push({ player, save });
    }
  }
  return out.sort(
    (a, b) =>
      displayName(a.player).localeCompare(displayName(b.player)) || a.player.id - b.player.id
  );
}

export async function unlocksOf(
  db: Database,
  characterGuids: string[],
  kinds: UnlockKind[]
): Promise<CharacterUnlockRow[]> {
  if (characterGuids.length === 0 || kinds.length === 0) return [];
  return db
    .select()
    .from(characterUnlocks)
    .where(
      and(
        inArray(characterUnlocks.characterGuid, characterGuids),
        inArray(characterUnlocks.kind, kinds)
      )
    );
}

export type JournalFinds = Map<string, Map<number, Date>>;

export async function journalFinds(
  db: Database,
  characters: SavedCharacter[]
): Promise<JournalFinds> {
  const owners = new Map(characters.map(({ player, save }) => [save.characterGuid, player.id]));
  const [saved, logged] = await Promise.all([
    unlocksOf(db, [...owners.keys()], ['journal']),
    db
      .select({
        playerId: journalEntries.playerId,
        entry: journalEntries.entry,
        at: journalEntries.at
      })
      .from(journalEntries)
      .innerJoin(players, eq(players.id, journalEntries.playerId))
      .where(eq(players.hidden, false))
  ]);
  const finds: JournalFinds = new Map();
  const note = (asset: string, player: number, at: Date) => {
    const byPlayer = finds.get(asset) ?? new Map<number, Date>();
    const known = byPlayer.get(player);
    if (!known || at < known) byPlayer.set(player, at);
    finds.set(asset, byPlayer);
  };
  for (const row of saved) {
    const player = owners.get(row.characterGuid);
    const asset = journalById.get(row.id)?.asset;
    if (player !== undefined && asset) note(asset, player, row.firstSeenAt);
  }
  for (const row of logged) {
    const asset = journalOf(row.entry)?.asset;
    if (asset) note(asset, row.playerId, row.at);
  }
  return finds;
}

export function journalCounts(finds: JournalFinds): Map<number, number> {
  const counts = new Map<number, number>();
  for (const byPlayer of finds.values()) {
    for (const player of byPlayer.keys()) counts.set(player, (counts.get(player) ?? 0) + 1);
  }
  return counts;
}
