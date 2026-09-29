import build from '$lib/world/build.json';
import progressionFacts from '$lib/world/progression.json';
import skillFacts from '$lib/world/skills.json';
import stationFacts from '$lib/world/stations.json';
import xpFacts from '$lib/world/xp.json';
import type { Schemas } from './common';
import {
  actorName,
  buildingsByAsset,
  itemName,
  liveBuildings,
  liveItems,
  liveRecipes,
  recipeName
} from './lookup';

type Catalog = Schemas['Catalog'];
type Xp = Schemas['CatalogXp'];
type Unlock = Schemas['CatalogUnlock'];
type Step = Schemas['CatalogUnlockStep'];

interface ConditionSide {
  type: string;
  condition: string;
  items?: (string | null)[];
  actors?: (string | null)[];
  skill?: string | null;
  level?: number | null;
}

const skillNames = new Map(skillFacts.skills.map((skill) => [skill.asset, skill.name]));

function stepOf(side: ConditionSide | null): Step | null {
  if (!side) return null;
  const match = side.condition === 'AnyMatch' ? 'any' : 'all';
  const blank = { items: [], actors: [], skill: null, level: null };
  if (side.type === 'ItemsPickedUp') {
    const items = (side.items ?? [])
      .filter((asset): asset is string => Boolean(asset))
      .map((asset) => ({ asset, name: itemName(asset) }));
    return items.length ? { ...blank, kind: 'pick_up', match, items } : null;
  }
  if (side.type === 'ActorsInteractedWith') {
    const actors = (side.actors ?? [])
      .filter((actor): actor is string => Boolean(actor))
      .map((actor) => ({ class: actor, name: actorName(actor) }));
    return actors.length ? { ...blank, kind: 'interact', match, actors } : null;
  }
  if (side.type === 'SkillLevelReached' && side.skill) {
    return {
      ...blank,
      kind: 'skill_level',
      match: 'all',
      skill: { asset: side.skill, name: skillNames.get(side.skill) ?? null },
      level: side.level ?? null
    };
  }
  return null;
}

function unlockOf(row: {
  condition: string;
  operator: string | null;
  first: unknown;
  second: unknown;
}): Unlock {
  const steps = [row.first, row.second]
    .map((side) => stepOf(side as ConditionSide | null))
    .filter((step): step is Step => step !== null);
  const operator = row.operator?.toLowerCase();
  return {
    text: row.condition.replace(/\s+/g, ' ').trim(),
    operator: steps.length > 1 && (operator === 'and' || operator === 'or') ? operator : null,
    steps
  };
}

function unlockConditions(): Map<string, Unlock> {
  const conditions = new Map<string, Unlock>();
  for (const table of progressionFacts.tables) {
    for (const row of table.rows) {
      if (!row.condition) continue;
      const unlock = unlockOf(row);
      for (const asset of [...row.recipes, ...row.buildings]) {
        if (asset && !conditions.has(asset)) conditions.set(asset, unlock);
      }
    }
  }
  return conditions;
}

const conditions = unlockConditions();

export function unlockFor(asset: string | null | undefined): Unlock | null {
  return asset ? (conditions.get(asset) ?? null) : null;
}

function stationsByRecipe(): Map<string, string[]> {
  const stations = new Map<string, string[]>();
  for (const station of stationFacts.stations) {
    for (const recipe of station.recipes) {
      if (!recipe) continue;
      stations.set(recipe, [...(stations.get(recipe) ?? []), station.id]);
    }
  }
  return stations;
}

function xpByEvent(): Map<string, Xp[]> {
  const events = new Map<string, Xp[]>();
  for (const event of xpFacts.events) {
    const skills = event.skills.flatMap((entry) =>
      entry.skill && typeof entry.xp === 'number' ? [{ skill: entry.skill, xp: entry.xp }] : []
    );
    events.set(`${event.table}|${event.row}`, skills);
  }
  return events;
}

export function recipeKind(recipe: {
  asset: string;
  creates: { item: string | null; count: number | null }[];
}): Schemas['CatalogRecipe']['kind'] {
  if (/_TEST_/i.test(recipe.asset)) return 'test';
  if (/(^|_)Vendor_/.test(recipe.asset)) return 'vendor';
  return recipe.creates.some((entry) => entry.item && (entry.count ?? 0) > 0) ? 'craft' : 'journal';
}

export function stationName(station: { id: string; name: string | null; building: string | null }) {
  return (
    station.name ??
    (station.building ? buildingsByAsset.get(station.building)?.name : null) ??
    station.id
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/v\d+$/, '')
      .trim()
  );
}

function amounts(entries: { item: string | null; count: number | null }[]) {
  return entries.map((entry) => ({ item: entry.item ?? null, count: entry.count ?? null }));
}

function buildCatalog(): Catalog {
  const stations = stationsByRecipe();
  const xp = xpByEvent();
  return {
    build: build.server_build,
    version: build.version,
    xp_for_level: xpFacts.xpForLevel,
    skills: skillFacts.skills
      .filter((skill) => !skill.deleted)
      .map((skill) => ({ id: skill.id, asset: skill.asset, name: skill.name })),
    items: liveItems.map((item) => ({
      id: item.id,
      asset: item.asset,
      name: item.name,
      category: item.category,
      stack: item.stack
    })),
    recipes: liveRecipes.map((recipe) => ({
      id: recipe.id,
      asset: recipe.asset,
      name: recipeName(recipe.asset),
      kind: recipeKind(recipe),
      creates: amounts(recipe.creates),
      consumes: amounts(recipe.consumes),
      xp:
        recipe.skill && typeof recipe.xp === 'number'
          ? [{ skill: recipe.skill, xp: recipe.xp }]
          : [],
      stations: stations.get(recipe.asset) ?? [],
      unlock: conditions.get(recipe.asset) ?? null
    })),
    buildings: liveBuildings.map((piece) => ({
      id: piece.id,
      asset: piece.asset,
      name: piece.name,
      category: piece.category,
      requirements: amounts(piece.requirements),
      xp: piece.xpEvent ? (xp.get(`${piece.xpEvent.table}|${piece.xpEvent.row}`) ?? []) : [],
      unlock: conditions.get(piece.asset) ?? null
    })),
    stations: stationFacts.stations.map((station) => ({
      id: station.id,
      name: stationName(station),
      kind: station.kind as 'crafting' | 'processing',
      building: station.building
    }))
  };
}

export const catalog: Catalog = buildCatalog();
