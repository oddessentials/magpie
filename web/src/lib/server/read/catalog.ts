import build from '$lib/world/build.json';
import progressionFacts from '$lib/world/progression.json';
import skillFacts from '$lib/world/skills.json';
import stationFacts from '$lib/world/stations.json';
import xpFacts from '$lib/world/xp.json';
import type { Schemas } from './common';
import { liveBuildings, liveItems, liveRecipes } from './lookup';

type Catalog = Schemas['Catalog'];
type Xp = Schemas['CatalogXp'];

function unlockConditions(): Map<string, string> {
  const conditions = new Map<string, string>();
  for (const table of progressionFacts.tables) {
    for (const row of table.rows) {
      if (!row.condition) continue;
      for (const asset of [...row.recipes, ...row.buildings]) {
        if (asset && !conditions.has(asset)) conditions.set(asset, row.condition);
      }
    }
  }
  return conditions;
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

function amounts(entries: { item: string | null; count: number | null }[]) {
  return entries.map((entry) => ({ item: entry.item ?? null, count: entry.count ?? null }));
}

function buildCatalog(): Catalog {
  const conditions = unlockConditions();
  const stations = stationsByRecipe();
  const xp = xpByEvent();
  return {
    build: build.server_build,
    version: build.version,
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
      name: station.name,
      kind: station.kind as 'crafting' | 'processing',
      building: station.building
    }))
  };
}

export const catalog: Catalog = buildCatalog();
