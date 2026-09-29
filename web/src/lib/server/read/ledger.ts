import type { Database } from '../db/client';
import type { SavedSlot } from '../db/schema';
import { savedCharacters, unlocksOf } from './characters';
import { playerRef, type Schemas } from './common';
import { skillFacts } from './facts';
import { buildingsById, itemsByAsset, itemsById, recipesById, withoutClassSuffix } from './lookup';
import { latestWorldSave, skillsOf } from './saves';

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
    ['recipe', 'building', 'item', 'actor']
  );
  const empty = () => ({ recipes: [], buildings: [], pickedUp: [], interacted: [] });
  const owned = new Map<
    string,
    { recipes: string[]; buildings: string[]; pickedUp: string[]; interacted: string[] }
  >();
  for (const row of unlocks) {
    const entry = owned.get(row.characterGuid) ?? empty();
    if (row.kind === 'recipe') {
      const asset = recipesById.get(row.id)?.asset;
      if (asset) entry.recipes.push(asset);
    } else if (row.kind === 'building') {
      const asset = buildingsById.get(row.id)?.asset;
      if (asset) entry.buildings.push(asset);
    } else if (row.kind === 'item') {
      const asset = itemsById.get(row.id)?.asset;
      if (asset) entry.pickedUp.push(asset);
    } else {
      entry.interacted.push(withoutClassSuffix(row.id));
    }
    owned.set(row.characterGuid, entry);
  }
  const skillAssets = new Map(skillFacts.map((skill) => [skill.id, skill.asset]));
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
      const entry = stock.get(item) ?? {
        item,
        name: itemsByAsset.get(item)?.name ?? null,
        category: itemsByAsset.get(item)?.category ?? null,
        count: 0,
        at_least: false,
        holders: []
      };
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
      const entry = owned.get(save.characterGuid) ?? empty();
      return {
        player: playerRef(player),
        saved_at: save.savedAt.toISOString(),
        recipes: [...new Set(entry.recipes)].sort(),
        buildings: [...new Set(entry.buildings)].sort(),
        picked_up: [...new Set(entry.pickedUp)].sort(),
        interacted: [...new Set(entry.interacted)].sort(),
        skills: skillsOf(save.skills).flatMap((skill) => {
          const asset = skillAssets.get(skill.id);
          return asset && skill.level !== null
            ? [{ skill: asset, level: skill.level, xp: skill.xp }]
            : [];
        })
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
              name: itemsById.get(entry.item)?.name ?? null,
              missing: entry.missing
            }))
          }
        : null
  };
}
