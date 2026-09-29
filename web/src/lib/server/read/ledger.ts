import type { Database } from '../db/client';
import type { SavedSlot } from '../db/schema';
import { savedCharacters, unlocksOf } from './characters';
import { playerRef, type Schemas } from './common';
import { buildingsById, itemsById, recipesById } from './lookup';
import { latestWorldSave } from './saves';

type Ledger = Schemas['Ledger'];
type Stock = Ledger['stock'][number];

export function itemAsset(id: string): string {
  return itemsById.get(id)?.asset ?? id;
}

export function slotCount(slot: Pick<SavedSlot, 'count'>): { count: number; atLeast: boolean } {
  return slot.count === null ? { count: 1, atLeast: true } : { count: slot.count, atLeast: false };
}

export async function getLedger(db: Database): Promise<Ledger> {
  const characters = await savedCharacters(db);
  const unlocks = await unlocksOf(
    db,
    characters.map((c) => c.save.characterGuid),
    ['recipe', 'building']
  );
  const owned = new Map<string, { recipes: string[]; buildings: string[] }>();
  for (const row of unlocks) {
    const entry = owned.get(row.characterGuid) ?? { recipes: [], buildings: [] };
    if (row.kind === 'recipe') {
      const asset = recipesById.get(row.id)?.asset;
      if (asset) entry.recipes.push(asset);
    } else {
      const asset = buildingsById.get(row.id)?.asset;
      if (asset) entry.buildings.push(asset);
    }
    owned.set(row.characterGuid, entry);
  }
  const stock = new Map<string, Stock>();
  for (const { player, save } of characters) {
    const held = new Map<string, { count: number; atLeast: boolean }>();
    for (const slot of save.inventory ?? []) {
      const item = itemAsset(slot.item);
      const { count, atLeast } = slotCount(slot);
      const known = held.get(item) ?? { count: 0, atLeast: false };
      held.set(item, { count: known.count + count, atLeast: known.atLeast || atLeast });
    }
    for (const [item, amount] of held) {
      const entry = stock.get(item) ?? { item, count: 0, at_least: false, holders: [] };
      entry.count += amount.count;
      entry.at_least = entry.at_least || amount.atLeast;
      entry.holders.push({
        player: playerRef(player),
        count: amount.count,
        at_least: amount.atLeast
      });
      stock.set(item, entry);
    }
  }
  const world = await latestWorldSave(db);
  const newest = characters.reduce<Date | null>(
    (latest, { save }) => (!latest || save.savedAt > latest ? save.savedAt : latest),
    null
  );
  return {
    saved_at: newest ? newest.toISOString() : null,
    players: characters.map(({ player, save }) => {
      const entry = owned.get(save.characterGuid) ?? { recipes: [], buildings: [] };
      return {
        player: playerRef(player),
        saved_at: save.savedAt.toISOString(),
        recipes: [...new Set(entry.recipes)].sort(),
        buildings: [...new Set(entry.buildings)].sort()
      };
    }),
    stock: [...stock.values()].sort((a, b) => a.item.localeCompare(b.item)),
    base:
      world && world.requirements && world.buildings
        ? {
            saved_at: world.savedAt.toISOString(),
            pieces: world.buildings.total,
            unfinished: world.buildings.unfinished,
            requirements: world.requirements.map((entry) => ({
              item: itemAsset(entry.item),
              missing: entry.missing
            }))
          }
        : null
  };
}
