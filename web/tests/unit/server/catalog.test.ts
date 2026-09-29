import { describe, expect, it } from 'vitest';
import { catalog } from '../../../src/lib/server/read/catalog';
import { isLayerName, layerNames, mapLayer } from '../../../src/lib/server/read/layers';
import { itemAsset, slotCount } from '../../../src/lib/server/read/ledger';
import {
  isKnownUnlock,
  itemsById,
  liveBuildings,
  liveItems,
  liveRecipes,
  recipesById
} from '../../../src/lib/server/read/lookup';
import { slotOf } from '../../../src/lib/server/read/saves';

describe('the catalog', () => {
  it('lists the live recipes and building pieces with their stations and unlocks', () => {
    expect(catalog.items).toHaveLength(liveItems.length);
    expect(catalog.recipes).toHaveLength(liveRecipes.length);
    expect(catalog.buildings).toHaveLength(liveBuildings.length);
    const stations = new Set(catalog.stations.map((station) => station.id));
    expect(catalog.recipes.every((recipe) => recipe.stations.every((id) => stations.has(id)))).toBe(
      true
    );
    expect(catalog.recipes.filter((recipe) => recipe.stations.length > 0).length).toBeGreaterThan(
      catalog.recipes.length / 2
    );
    expect(catalog.recipes.some((recipe) => recipe.unlock !== null)).toBe(true);
    expect(catalog.recipes.some((recipe) => recipe.xp.length > 0)).toBe(true);
    expect(catalog.buildings.some((piece) => piece.xp.length > 0)).toBe(true);
    expect(catalog.buildings.some((piece) => piece.requirements.length > 0)).toBe(true);
    expect(catalog.skills.length).toBe(12);
  });
});

describe('map layers', () => {
  it('serves every layer from the game facts with named groups and points', () => {
    for (const name of layerNames) {
      const layer = mapLayer(name);
      expect(layer.layer).toBe(name);
      expect(layer.build).toBeGreaterThan(0);
      expect(layer.groups.length).toBeGreaterThan(0);
      for (const group of layer.groups) {
        expect(group.points.length).toBeGreaterThan(0);
        expect(group.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
      }
    }
    expect(
      mapLayer('resources').groups.some((group) => group.name === 'DEFAULT DISPLAY NAME')
    ).toBe(false);
    expect(mapLayer('spawns').groups.some((group) => group.kind === 'boss')).toBe(true);
    expect(JSON.stringify(layerNames.map(mapLayer))).not.toMatch(/[0-9a-f]{32}/i);
  });

  it('accepts only the listed layer names', () => {
    expect(isLayerName('resources')).toBe(true);
    expect(isLayerName('players')).toBe(false);
    expect(isLayerName('')).toBe(false);
  });
});

describe('saved slots and unlocks', () => {
  const item = liveItems.find((entry) => entry.id && entry.name)!;

  it('names a saved item by its facts and keeps unknown ids', () => {
    expect(itemAsset(item.id!)).toBe(item.asset);
    expect(itemAsset('unknown-item')).toBe('unknown-item');
    expect(slotOf({ slot: 3, item: item.id!, count: 12, durability: null })).toEqual({
      slot: 3,
      item: item.asset,
      name: item.name,
      count: 12,
      at_least: false,
      durability: null
    });
    expect(slotOf({ slot: 0, item: 'unknown-item', count: null, durability: 40 })).toEqual({
      slot: 0,
      item: null,
      name: null,
      count: 1,
      at_least: true,
      durability: 40
    });
    expect(itemsById.get(item.id!)).toBe(item);
  });

  it('counts a slot without a stack size as at least one', () => {
    expect(slotCount({ count: null })).toEqual({ count: 1, atLeast: true });
    expect(slotCount({ count: 7 })).toEqual({ count: 7, atLeast: false });
  });

  it('counts only unlocks the game facts know', () => {
    const recipe = [...recipesById.keys()][0]!;
    expect(isKnownUnlock({ kind: 'recipe', id: recipe })).toBe(true);
    expect(isKnownUnlock({ kind: 'recipe', id: 'removed-recipe' })).toBe(false);
    expect(isKnownUnlock({ kind: 'item', id: item.id! })).toBe(false);
  });
});
