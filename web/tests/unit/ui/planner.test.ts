import { describe, expect, it } from 'vitest';
import type { CatalogBuilding, CatalogRecipe, CatalogUnlock } from '$lib/api/types';
import {
  decodeChoices,
  decodePlan,
  encodeChoices,
  encodePlan,
  planOf,
  recipesByOutput,
  unlockState,
  type Person
} from '$lib/ui/planner';

function recipe(
  asset: string,
  creates: [string, number][],
  consumes: [string, number][],
  extra: Partial<CatalogRecipe> = {}
): CatalogRecipe {
  return {
    id: null,
    asset,
    name: null,
    kind: 'craft',
    creates: creates.map(([item, count]) => ({ item, count })),
    consumes: consumes.map(([item, count]) => ({ item, count })),
    xp: [],
    stations: ['anvil'],
    unlock: null,
    ...extra
  };
}

const recipes = [
  recipe('R_Bar', [['bar', 1]], [['ore', 2]], { xp: [{ skill: 'SKILL_Smithing', xp: 5 }] }),
  recipe('R_Sword', [['sword', 1]], [['bar', 3]], { xp: [{ skill: 'SKILL_Smithing', xp: 50 }] }),
  recipe('R_Plank', [['plank', 2]], [['log', 1]]),
  recipe(
    'R_Arrow',
    [['arrow', 5]],
    [
      ['plank', 1],
      ['feather', 1]
    ]
  ),
  recipe('R_Vendor_Bar', [['bar', 1]], [['coin', 10]], { stations: [], kind: 'vendor' }),
  recipe('R_Handmade_Bar', [['bar', 1]], [['ore', 3]], { stations: [] }),
  recipe('R_Leaf', [['leaf', 10]], [['bar', 1]]),
  recipe('R_Bar_From_Leaf', [['bar', 1]], [['leaf', 10]]),
  recipe('R_Journal', [], [], { kind: 'journal' }),
  recipe('R_A', [['a', 1]], [['b', 1]]),
  recipe('R_B', [['b', 1]], [['a', 1]])
];

const wall: CatalogBuilding = {
  id: null,
  asset: 'B_Wall',
  name: 'Wall',
  category: null,
  requirements: [{ item: 'plank', count: 4 }],
  xp: [{ skill: 'SKILL_Construction', xp: 10 }],
  unlock: null
};

const catalog = { recipes, buildings: [wall] };

describe('the ledger planner', () => {
  it('prefers station recipes, never melts a product back, and skips trades and journal pages', () => {
    const index = recipesByOutput(recipes);
    expect(index.get('bar')!.map((entry) => entry.asset)).toEqual([
      'R_Bar',
      'R_Handmade_Bar',
      'R_Bar_From_Leaf'
    ]);
    const all = [...index.values()].flat().map((entry) => entry.asset);
    expect(all).not.toContain('R_Vendor_Bar');
    expect(all).not.toContain('R_Journal');
  });

  it('expands a target down to raw materials, deepest step first, with the XP it gives', () => {
    const plan = planOf([{ kind: 'item', asset: 'sword', count: 2 }], catalog);
    expect(plan.steps).toEqual([
      { recipe: 'R_Bar', item: 'bar', runs: 6, depth: 1 },
      { recipe: 'R_Sword', item: 'sword', runs: 2, depth: 0 }
    ]);
    expect(plan.raw).toEqual([{ item: 'ore', needed: 12, fromStock: 0, missing: 12 }]);
    expect(plan.xp).toEqual([{ skill: 'SKILL_Smithing', xp: 130 }]);
  });

  it('rounds runs up to whole batches and reuses what a batch leaves over', () => {
    const plan = planOf(
      [
        { kind: 'item', asset: 'arrow', count: 3 },
        { kind: 'item', asset: 'arrow', count: 3 }
      ],
      catalog
    );
    expect(plan.steps.find((step) => step.recipe === 'R_Arrow')!.runs).toBe(2);
    expect(plan.steps.find((step) => step.recipe === 'R_Plank')!.runs).toBe(1);
    expect(plan.raw).toEqual([
      { item: 'feather', needed: 2, fromStock: 0, missing: 2 },
      { item: 'log', needed: 1, fromStock: 0, missing: 1 }
    ]);
  });

  it('takes what the group holds before crafting or gathering, but never the target itself', () => {
    const stock = new Map([
      ['bar', 4],
      ['sword', 5]
    ]);
    const plan = planOf([{ kind: 'item', asset: 'sword', count: 2 }], catalog, stock);
    expect(plan.steps).toEqual([
      { recipe: 'R_Bar', item: 'bar', runs: 2, depth: 1 },
      { recipe: 'R_Sword', item: 'sword', runs: 2, depth: 0 }
    ]);
    expect(plan.stocked).toEqual([{ item: 'bar', needed: 4, fromStock: 4, missing: 0 }]);
    expect(plan.raw).toEqual([{ item: 'ore', needed: 4, fromStock: 0, missing: 4 }]);
  });

  it('plans building pieces from their requirements and counts stocked raw materials', () => {
    const plan = planOf(
      [{ kind: 'building', asset: 'B_Wall', count: 3 }],
      catalog,
      new Map([['log', 10]])
    );
    expect(plan.steps).toEqual([{ recipe: 'R_Plank', item: 'plank', runs: 6, depth: 1 }]);
    expect(plan.raw).toEqual([{ item: 'log', needed: 6, fromStock: 6, missing: 0 }]);
    expect(plan.xp).toEqual([{ skill: 'SKILL_Construction', xp: 30 }]);
  });

  it('uses the recipe a player picks for an item', () => {
    const plan = planOf(
      [{ kind: 'item', asset: 'sword', count: 1 }],
      catalog,
      null,
      recipesByOutput(recipes),
      new Map([['bar', 'R_Handmade_Bar']])
    );
    expect(plan.steps.map((step) => step.recipe)).toEqual(['R_Handmade_Bar', 'R_Sword']);
    expect(plan.raw).toEqual([{ item: 'ore', needed: 9, fromStock: 0, missing: 9 }]);
    const choices = new Map([['bar', 'R_Handmade_Bar']]);
    expect(decodeChoices(encodeChoices(choices))).toEqual(choices);
    expect(decodeChoices('bad entry,bar:R_Bar')).toEqual(new Map([['bar', 'R_Bar']]));
  });

  it('stops at a loop in the recipes instead of expanding forever', () => {
    const plan = planOf([{ kind: 'item', asset: 'a', count: 1 }], catalog);
    expect(plan.steps.map((step) => step.recipe)).toEqual(['R_B', 'R_A']);
    expect(plan.raw).toEqual([{ item: 'a', needed: 1, fromStock: 0, missing: 1 }]);
  });

  it('shares a plan as a link and reads it back', () => {
    const targets = [
      { kind: 'building' as const, asset: 'B_Wall', count: 3 },
      { kind: 'item' as const, asset: 'ITEM_Sword+1', count: 2 }
    ];
    const text = encodePlan(targets);
    expect(text).toBe('b:B_Wall*3,i:ITEM_Sword+1*2');
    expect(decodePlan(text)).toEqual(targets);
    expect(decodePlan('i:x*2,i:x*3,q:y*1,i:bad name*1,i:z*0,i:w*99999')).toEqual([
      { kind: 'item', asset: 'x', count: 5 }
    ]);
    expect(decodePlan(null)).toEqual([]);
  });
});

describe('unlock conditions', () => {
  const person: Person = {
    picked_up: ['ITEM_Bar_Bronze'],
    interacted: ['BP_Crafting_Anvil'],
    skills: [{ skill: 'SKILL_Smithing', level: 12, xp: 2_000 }]
  };
  const step = (kind: 'pick_up' | 'interact' | 'skill_level', match: 'all' | 'any' = 'all') => ({
    kind,
    match,
    items: [],
    actors: [],
    skill: null,
    level: null
  });
  const pickUp = (match: 'all' | 'any', ...assets: string[]) => ({
    ...step('pick_up', match),
    items: assets.map((asset) => ({ asset, name: asset }))
  });
  const use = (...classes: string[]) => ({
    ...step('interact'),
    actors: classes.map((name) => ({ class: name, name }))
  });
  const level = (value: number) => ({
    ...step('skill_level'),
    skill: { asset: 'SKILL_Smithing', name: 'Smithing' },
    level: value
  });
  const unlock = (operator: 'and' | 'or' | null, ...steps: CatalogUnlock['steps']) => ({
    text: '',
    operator,
    steps
  });

  it('checks each step against what the character has done', () => {
    expect(unlockState(unlock(null, pickUp('all', 'ITEM_Bar_Bronze')), person).met).toBe(true);
    expect(
      unlockState(unlock(null, pickUp('all', 'ITEM_Bar_Bronze', 'ITEM_Bar_Iron')), person).met
    ).toBe(false);
    expect(
      unlockState(unlock(null, pickUp('any', 'ITEM_Bar_Bronze', 'ITEM_Bar_Iron')), person).met
    ).toBe(true);
    expect(unlockState(unlock(null, use('BP_Crafting_Anvil')), person).met).toBe(true);
    expect(unlockState(unlock(null, level(12)), person).met).toBe(true);
    expect(unlockState(unlock(null, level(13)), person).met).toBe(false);
  });

  it('joins the steps with the operator and knows when nothing is listed', () => {
    const both = unlock('and', pickUp('all', 'ITEM_Bar_Iron'), use('BP_Crafting_Anvil'));
    expect(unlockState(both, person).met).toBe(false);
    expect(unlockState(both, person).steps.map((entry) => entry.met)).toEqual([false, true]);
    expect(unlockState({ ...both, operator: 'or' }, person).met).toBe(true);
    expect(unlockState(unlock(null), person).met).toBeNull();
  });
});
