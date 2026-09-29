import type { Database } from '../db/client';
import { savedCharacters, unlocksOf } from './characters';
import { playerRef, type Schemas } from './common';
import { creaturesById, liveJournal } from './lookup';

type Journal = Schemas['Journal'];

export async function getJournal(db: Database): Promise<Journal> {
  const characters = await savedCharacters(db);
  const owners = new Map(characters.map(({ player, save }) => [save.characterGuid, player.id]));
  const rows = await unlocksOf(db, [...owners.keys()], ['journal']);
  const found = new Map<
    string,
    { players: Set<number>; first: { player: number; at: Date } | null }
  >();
  const counts = new Map<number, number>();
  for (const row of rows) {
    const player = owners.get(row.characterGuid);
    if (player === undefined) continue;
    const entry = found.get(row.id) ?? { players: new Set<number>(), first: null };
    entry.players.add(player);
    if (!entry.first || row.firstSeenAt < entry.first.at)
      entry.first = { player, at: row.firstSeenAt };
    found.set(row.id, entry);
  }
  const known = new Set(liveJournal.map((entry) => entry.id));
  for (const [id, entry] of found) {
    if (!known.has(id)) continue;
    for (const player of entry.players) counts.set(player, (counts.get(player) ?? 0) + 1);
  }
  const newest = characters.reduce<Date | null>(
    (latest, { save }) => (!latest || save.savedAt > latest ? save.savedAt : latest),
    null
  );
  return {
    saved_at: newest ? newest.toISOString() : null,
    entries: liveJournal.map((entry) => {
      const seen = entry.id ? found.get(entry.id) : undefined;
      return {
        id: entry.id,
        asset: entry.asset,
        name: entry.name,
        category: entry.category,
        group: entry.group,
        unlock: entry.unlock,
        item: entry.item,
        recipe: entry.recipe,
        creature: entry.creature ? (creaturesById.get(entry.creature)?.name ?? null) : null,
        regions: entry.locations,
        found_by: seen ? [...seen.players].sort((a, b) => a - b) : [],
        first_found: seen?.first
          ? { player: seen.first.player, at: seen.first.at.toISOString() }
          : null
      };
    }),
    players: characters.map(({ player }) => ({
      player: playerRef(player),
      found: counts.get(player.id) ?? 0
    }))
  };
}
