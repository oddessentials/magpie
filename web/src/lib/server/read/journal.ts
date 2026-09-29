import type { Database } from '../db/client';
import { journalCounts, journalFinds, savedCharacters } from './characters';
import { displayName, playerRef, playersById, type Schemas } from './common';
import { unlockFor } from './catalog';
import { findable } from './layers';
import { creaturesById, itemName, liveJournal } from './lookup';

type Journal = Schemas['Journal'];

function findOf(entry: (typeof liveJournal)[number]): string | null {
  for (const item of [entry.item, ...entry.materials]) {
    if (item && findable.item.has(item)) return `item:${item}`;
  }
  const creature = entry.creature ? creaturesById.get(entry.creature)?.asset : undefined;
  if (creature && findable.creature.has(creature)) return `creature:${creature}`;
  if (findable.lore.has(entry.asset)) return `lore:${entry.asset}`;
  return null;
}

export async function getJournal(db: Database): Promise<Journal> {
  const characters = await savedCharacters(db);
  const finds = await journalFinds(db, characters);
  const counts = journalCounts(finds);
  const saved = new Set(characters.map(({ player }) => player.id));
  const others = await playersById(
    db,
    [...counts.keys()].filter((id) => !saved.has(id))
  );
  const people = [
    ...characters.map(({ player }) => player),
    ...[...others.values()].filter((player) => !player.hidden)
  ].sort((a, b) => displayName(a).localeCompare(displayName(b)) || a.id - b.id);
  const newest = characters.reduce<Date | null>(
    (latest, { save }) => (!latest || save.savedAt > latest ? save.savedAt : latest),
    null
  );
  const unlocks: Schemas['CatalogUnlock'][] = [];
  const indexes = new Map<Schemas['CatalogUnlock'], number>();
  const unlockIndex = (recipe: string | null) => {
    const unlock = unlockFor(recipe);
    if (!unlock) return null;
    let index = indexes.get(unlock);
    if (index === undefined) {
      index = unlocks.push(unlock) - 1;
      indexes.set(unlock, index);
    }
    return index;
  };
  const entries = liveJournal.map((entry) => {
    const seen = [...(finds.get(entry.asset) ?? new Map<number, Date>()).entries()].sort(
      ([a, first], [b, second]) => first.getTime() - second.getTime() || a - b
    );
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
      item_name: itemName(entry.item),
      recipe_unlock: unlockIndex(entry.recipe),
      find: findOf(entry),
      regions: entry.locations,
      found_by: seen.map(([player]) => player).sort((a, b) => a - b),
      first_found: seen[0] ? { player: seen[0][0], at: seen[0][1].toISOString() } : null
    };
  });
  return {
    saved_at: newest ? newest.toISOString() : null,
    unlocks,
    entries,
    players: people.map((player) => ({
      player: playerRef(player),
      found: counts.get(player.id) ?? 0
    }))
  };
}
