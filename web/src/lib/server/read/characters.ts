import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  characterSaves,
  characterUnlocks,
  players,
  type CharacterSaveRow,
  type CharacterUnlockRow,
  type PlayerRow
} from '../db/schema';
import type { UnlockKind } from '../ingest/saves';
import { displayName } from './common';

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
