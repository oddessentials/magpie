import type {
  Catalog,
  CatalogRecipe,
  CatalogUnlock,
  CatalogUnlockStep,
  Ledger
} from '$lib/api/types';

export type PlanKind = 'item' | 'building';

export interface Target {
  kind: PlanKind;
  asset: string;
  count: number;
}

export interface PlanStep {
  recipe: string;
  item: string;
  runs: number;
  depth: number;
}

export interface PlanNeed {
  item: string;
  needed: number;
  fromStock: number;
  missing: number;
}

export interface Plan {
  steps: PlanStep[];
  raw: PlanNeed[];
  stocked: PlanNeed[];
  xp: { skill: string; xp: number }[];
}

export type PlanCatalog = Pick<Catalog, 'recipes' | 'buildings'>;
export type Person = Pick<Ledger['players'][number], 'picked_up' | 'interacted' | 'skills'>;

export const maxTargets = 30;
export const maxCount = 9999;

export function makes(recipe: Pick<CatalogRecipe, 'creates'>, item: string): number {
  return recipe.creates
    .filter((entry) => entry.item === item)
    .reduce((sum, entry) => sum + Math.max(0, entry.count ?? 0), 0);
}

export function isCraftable(recipe: Pick<CatalogRecipe, 'kind' | 'creates'>): boolean {
  return (
    recipe.kind === 'craft' &&
    recipe.creates.some((entry) => entry.item !== null && (entry.count ?? 0) > 0)
  );
}

export function recipesByOutput(recipes: CatalogRecipe[]): Map<string, CatalogRecipe[]> {
  const crafts = recipes.filter(isCraftable);
  const index = new Map<string, CatalogRecipe[]>();
  const madeFrom = new Map<string, Set<string>>();
  for (const recipe of crafts) {
    for (const entry of recipe.creates) {
      if (!entry.item || (entry.count ?? 0) <= 0) continue;
      const list = index.get(entry.item) ?? [];
      if (!list.includes(recipe)) list.push(recipe);
      index.set(entry.item, list);
    }
    for (const input of recipe.consumes) {
      if (!input.item) continue;
      const made = madeFrom.get(input.item) ?? new Set<string>();
      for (const entry of recipe.creates) if (entry.item) made.add(entry.item);
      madeFrom.set(input.item, made);
    }
  }
  for (const [item, list] of index) {
    const reverse = (recipe: CatalogRecipe) =>
      recipe.consumes.some((input) => input.item && madeFrom.get(item)?.has(input.item));
    const cost = (recipe: CatalogRecipe) =>
      recipe.consumes.reduce((sum, input) => sum + Math.max(0, input.count ?? 0), 0) /
      Math.max(1, makes(recipe, item));
    list.sort(
      (a, b) =>
        Number(reverse(a)) - Number(reverse(b)) ||
        cost(a) - cost(b) ||
        Number(b.stations.length > 0) - Number(a.stations.length > 0) ||
        a.asset.localeCompare(b.asset)
    );
  }
  return index;
}

export function planOf(
  targets: Target[],
  catalog: PlanCatalog,
  stock: Map<string, number> | null = null,
  byOutput: Map<string, CatalogRecipe[]> = recipesByOutput(catalog.recipes),
  choices: Map<string, string> = new Map()
): Plan {
  const recipes = new Map(catalog.recipes.map((recipe) => [recipe.asset, recipe]));
  const pieces = new Map(catalog.buildings.map((piece) => [piece.asset, piece]));
  const left = new Map(stock ?? []);
  const spare = new Map<string, number>();
  const fromStock = new Map<string, number>();
  const gathered = new Map<string, number>();
  const runs = new Map<string, number>();
  const depths = new Map<string, number>();
  const outputs = new Map<string, string>();
  const xp = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, value: number) =>
    map.set(key, (map.get(key) ?? 0) + value);

  const take = (pool: Map<string, number>, item: string, wanted: number) => {
    const available = pool.get(item) ?? 0;
    const taken = Math.min(available, wanted);
    if (taken > 0) pool.set(item, available - taken);
    return taken;
  };

  function need(
    item: string,
    quantity: number,
    depth: number,
    path: Set<string>,
    useStock: boolean
  ) {
    let wanted = quantity - take(spare, item, quantity);
    if (wanted <= 0) return;
    if (useStock) {
      const taken = take(left, item, wanted);
      if (taken > 0) add(fromStock, item, taken);
      wanted -= taken;
      if (wanted <= 0) return;
    }
    const options = byOutput.get(item);
    const chosen = choices.get(item);
    const recipe =
      (chosen ? options?.find((entry) => entry.asset === chosen) : undefined) ?? options?.[0];
    if (!recipe || path.has(item)) {
      add(gathered, item, wanted);
      return;
    }
    const perRun = makes(recipe, item);
    const count = Math.ceil(wanted / perRun);
    add(runs, recipe.asset, count);
    depths.set(recipe.asset, Math.max(depths.get(recipe.asset) ?? 0, depth));
    if (!outputs.has(recipe.asset)) outputs.set(recipe.asset, item);
    if (count * perRun > wanted) add(spare, item, count * perRun - wanted);
    for (const entry of recipe.creates) {
      if (entry.item && entry.item !== item && (entry.count ?? 0) > 0) {
        add(spare, entry.item, (entry.count ?? 0) * count);
      }
    }
    for (const gain of recipe.xp) add(xp, gain.skill, gain.xp * count);
    const next = new Set(path).add(item);
    for (const entry of recipe.consumes) {
      if (entry.item && (entry.count ?? 0) > 0) {
        need(entry.item, (entry.count ?? 0) * count, depth + 1, next, true);
      }
    }
  }

  for (const target of targets) {
    if (target.count <= 0) continue;
    if (target.kind === 'building') {
      const piece = pieces.get(target.asset);
      if (!piece) continue;
      for (const gain of piece.xp) add(xp, gain.skill, gain.xp * target.count);
      for (const entry of piece.requirements) {
        if (entry.item && (entry.count ?? 0) > 0) {
          need(entry.item, (entry.count ?? 0) * target.count, 1, new Set(), true);
        }
      }
    } else {
      need(target.asset, target.count, 0, new Set(), false);
    }
  }

  const needs = (items: Iterable<string>) =>
    [...new Set(items)]
      .map((item) => {
        const stocked = fromStock.get(item) ?? 0;
        const missing = gathered.get(item) ?? 0;
        return { item, needed: stocked + missing, fromStock: stocked, missing };
      })
      .sort((a, b) => a.item.localeCompare(b.item));

  return {
    steps: [...runs.entries()]
      .map(([recipe, count]) => ({
        recipe,
        item: outputs.get(recipe) ?? '',
        runs: count,
        depth: depths.get(recipe) ?? 0
      }))
      .filter((step) => recipes.has(step.recipe))
      .sort((a, b) => b.depth - a.depth || a.recipe.localeCompare(b.recipe)),
    raw: needs([
      ...gathered.keys(),
      ...[...fromStock.keys()].filter((item) => !byOutput.has(item))
    ]),
    stocked: needs(
      [...fromStock.keys()].filter((item) => byOutput.has(item) && !gathered.has(item))
    ),
    xp: [...xp.entries()]
      .map(([skill, total]) => ({ skill, xp: total }))
      .sort((a, b) => b.xp - a.xp || a.skill.localeCompare(b.skill))
  };
}

export function stockOf(ledger: Pick<Ledger, 'stock'>): Map<string, number> {
  return new Map(ledger.stock.map((entry) => [entry.item, entry.count]));
}

export function encodePlan(targets: Target[]): string {
  return targets
    .filter((target) => target.count > 0)
    .map((target) => `${target.kind === 'building' ? 'b' : 'i'}:${target.asset}*${target.count}`)
    .join(',');
}

export function decodePlan(text: string | null): Target[] {
  if (!text) return [];
  const targets: Target[] = [];
  for (const part of text.split(',')) {
    const match = /^([bi]):([A-Za-z0-9_.+-]+)\*(\d{1,4})$/.exec(part.trim());
    if (!match) continue;
    const count = Number(match[3]);
    if (count < 1 || count > maxCount) continue;
    const kind: PlanKind = match[1] === 'b' ? 'building' : 'item';
    const known = targets.find((target) => target.kind === kind && target.asset === match[2]);
    if (known) known.count = Math.min(maxCount, known.count + count);
    else if (targets.length < maxTargets) targets.push({ kind, asset: match[2]!, count });
  }
  return targets;
}

export function encodeChoices(choices: Map<string, string>): string {
  return [...choices.entries()].map(([item, recipe]) => `${item}:${recipe}`).join(',');
}

export function decodeChoices(text: string | null): Map<string, string> {
  const choices = new Map<string, string>();
  for (const part of (text ?? '').split(',')) {
    const match = /^([A-Za-z0-9_.+-]+):([A-Za-z0-9_.+-]+)$/.exec(part.trim());
    if (match && choices.size < maxTargets * 4) choices.set(match[1]!, match[2]!);
  }
  return choices;
}

export interface StepState {
  step: CatalogUnlockStep;
  met: boolean;
}

export function stepState(step: CatalogUnlockStep, person: Person): StepState {
  if (step.kind === 'skill_level') {
    const level = person.skills.find((entry) => entry.skill === step.skill?.asset)?.level ?? 1;
    return { step, met: level >= (step.level ?? 1) };
  }
  const owned = new Set(step.kind === 'pick_up' ? person.picked_up : person.interacted);
  const wanted =
    step.kind === 'pick_up'
      ? step.items.map((entry) => entry.asset)
      : step.actors.map((entry) => entry.class);
  const hits = wanted.filter((key) => owned.has(key)).length;
  return { step, met: step.match === 'any' ? hits > 0 : hits === wanted.length };
}

export function unlockState(
  unlock: CatalogUnlock,
  person: Person
): { met: boolean | null; steps: StepState[] } {
  const steps = unlock.steps.map((step) => stepState(step, person));
  if (steps.length === 0) return { met: null, steps };
  const met =
    unlock.operator === 'or' ? steps.some((entry) => entry.met) : steps.every((entry) => entry.met);
  return { met, steps };
}
