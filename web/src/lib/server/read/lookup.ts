import buildingFacts from '$lib/world/buildings.json';
import creatureFacts from '$lib/world/creatures.json';
import itemFacts from '$lib/world/items.json';
import journalFacts from '$lib/world/journal.json';
import questFacts from '$lib/world/quests.json';
import recipeFacts from '$lib/world/recipes.json';

export interface ItemFact {
  id: string | null;
  asset: string;
  name: string | null;
}

const live = <T extends { deleted: boolean }>(rows: T[]) => rows.filter((row) => !row.deleted);

export const liveItems = live(itemFacts.items);
export const liveRecipes = live(recipeFacts.recipes);
export const liveBuildings = live(buildingFacts.buildings);
export const liveJournal = live(journalFacts.entries);
export const liveQuests = live(questFacts.quests);
export const liveCreatures = live(creatureFacts.creatures);

function byId<T extends { id: string | null }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) if (row.id && !map.has(row.id)) map.set(row.id, row);
  return map;
}

function byAsset<T extends { asset: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.asset, row]));
}

export const itemsById = byId(itemFacts.items);
export const itemsByAsset = byAsset(itemFacts.items);
export const recipesById = byId(liveRecipes);
export const recipesByAsset = byAsset(liveRecipes);
export const buildingsById = byId(liveBuildings);
export const buildingsByAsset = byAsset(liveBuildings);
export const journalById = byId(liveJournal);
export const questsById = byId(liveQuests);
export const questsByAsset = byAsset(liveQuests);
export const creaturesById = byId(liveCreatures);
export const creaturesByAsset = byAsset(liveCreatures);

const counted = {
  recipe: recipesById,
  building: buildingsById,
  journal: journalById,
  creature: creaturesById
} as const;

export type CountedKind = keyof typeof counted;
export const countedKinds = Object.keys(counted) as CountedKind[];

export function isKnownUnlock(row: { kind: string; id: string }): boolean {
  return counted[row.kind as CountedKind]?.has(row.id) ?? false;
}

export function itemName(asset: string | null | undefined): string | null {
  return asset ? (itemsByAsset.get(asset)?.name ?? null) : null;
}

const journalByRecipe = new Map<string, string>();
for (const entry of liveJournal) {
  if (entry.recipe && entry.name && !journalByRecipe.has(entry.recipe)) {
    journalByRecipe.set(entry.recipe, entry.name);
  }
}

export function recipeName(asset: string): string | null {
  return (
    itemName(recipesByAsset.get(asset)?.creates[0]?.item) ?? journalByRecipe.get(asset) ?? null
  );
}

export const withoutClassSuffix = (actor: string) => actor.replace(/_C$/, '');

const actorNames = new Map<string, string>();
for (const piece of liveBuildings) {
  const actor = piece.actor ? withoutClassSuffix(piece.actor) : null;
  if (actor && piece.name && !actorNames.has(actor)) actorNames.set(actor, piece.name);
}

export function actorName(actor: string): string {
  const key = withoutClassSuffix(actor);
  return (
    actorNames.get(key) ??
    key
      .replace(/^BP_/, '')
      .replace(/^(NPC|BaseBuilding|UpgradeProp|Crafting|Station)_/, '')
      .split('_')
      .map((part) => part.replace(/([a-z])([A-Z])/g, '$1 $2'))
      .join(' ')
      .trim()
  );
}

const journalByAsset = new Map(liveJournal.map((entry) => [entry.asset.toLowerCase(), entry]));

export function journalOf(asset: string) {
  return journalByAsset.get(asset.trim().toLowerCase()) ?? null;
}

export function questOf(key: string) {
  return questsById.get(key) ?? questsByAsset.get(key) ?? null;
}

export function areaName(region: string | null | undefined): string | null {
  return region ? region.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2') : null;
}

export const bossCreatureIds = new Set(liveCreatures.filter((c) => c.boss).map((c) => c.id));
