<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/api/client';
  import type { Catalog } from '$lib/api/types';
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatNumber } from '$lib/ui/format';
  import Freshness from '$lib/ui/Freshness.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import { levelFor } from '$lib/ui/levels';
  import { categoryLabel, listText } from '$lib/ui/names';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import {
    decodeChoices,
    decodePlan,
    encodeChoices,
    encodePlan,
    isCraftable,
    maxCount,
    maxTargets,
    planOf,
    recipesByOutput,
    stockOf,
    type PlanKind,
    type Target
  } from '$lib/ui/planner';
  import PlayerLink from '$lib/ui/PlayerLink.svelte';
  import { withParams } from '$lib/ui/query';
  import Stat from '$lib/ui/Stat.svelte';
  import { t } from '$lib/ui/strings';
  import UnlockSteps from '$lib/ui/UnlockSteps.svelte';

  let { data } = $props();

  const ledger = $derived(data.ledger.ok ? data.ledger.data : null);
  const initial = untrack(() => page.url.searchParams);
  let targets = $state<Target[]>(decodePlan(initial.get('plan')));
  let useStock = $state(initial.get('stock') !== 'off');
  const choices = new SvelteMap<string, string>(decodeChoices(initial.get('use')));
  let query = $state('');
  let progressFor = $state('');
  let stockQuery = $state('');
  let copied = $state(false);
  let catalog = $state<Catalog | null>(null);
  let failed = $state(false);

  onMount(() => {
    api
      .getCatalog()
      .then((loaded) => {
        catalog = loaded;
      })
      .catch(() => {
        failed = true;
      });
  });

  const items = $derived(new Map((catalog?.items ?? []).map((item) => [item.asset, item])));
  const pieces = $derived(new Map((catalog?.buildings ?? []).map((piece) => [piece.asset, piece])));
  const recipes = $derived(
    new Map((catalog?.recipes ?? []).map((recipe) => [recipe.asset, recipe]))
  );
  const stations = $derived(
    new Map((catalog?.stations ?? []).map((station) => [station.id, station]))
  );
  const skills = $derived(
    new Map((catalog?.skills ?? []).map((skill) => [skill.asset, skill.name]))
  );
  const byOutput = $derived(recipesByOutput(catalog?.recipes ?? []));
  const itemName = (asset: string) => items.get(asset)?.name ?? asset;
  const targetName = (target: Target) =>
    (target.kind === 'building' ? pieces.get(target.asset)?.name : items.get(target.asset)?.name) ??
    target.asset;

  const candidates = $derived.by(() => {
    if (!catalog) return [];
    const made = new Set(
      catalog.recipes
        .filter(isCraftable)
        .flatMap((recipe) => recipe.creates.map((entry) => entry.item))
    );
    return [
      ...catalog.items
        .filter((item) => item.name && made.has(item.asset))
        .map((item) => ({
          kind: 'item' as PlanKind,
          asset: item.asset,
          name: item.name!,
          category: categoryLabel(item.category) ?? t.ledger.item
        })),
      ...catalog.buildings
        .filter((piece) => piece.name && piece.requirements.some((entry) => entry.item))
        .map((piece) => ({
          kind: 'building' as PlanKind,
          asset: piece.asset,
          name: piece.name!,
          category: categoryLabel(piece.category) ?? t.ledger.piece
        }))
    ];
  });
  const needle = $derived(query.trim().toLowerCase());
  const results = $derived(
    needle.length < 2
      ? []
      : candidates
          .filter((choice) => choice.name.toLowerCase().includes(needle))
          .sort(
            (a, b) =>
              Number(!a.name.toLowerCase().startsWith(needle)) -
                Number(!b.name.toLowerCase().startsWith(needle)) || a.name.localeCompare(b.name)
          )
          .slice(0, 12)
  );

  const stock = $derived(ledger && useStock ? stockOf(ledger) : null);
  const plan = $derived(
    catalog && targets.length ? planOf(targets, catalog, stock, byOutput, new Map(choices)) : null
  );
  const inputsText = (recipe: Catalog['recipes'][number]) =>
    recipe.consumes
      .filter((entry) => entry.item)
      .map((entry) => `${formatNumber(entry.count ?? 0)} ${itemName(entry.item!)}`)
      .join(' · ');
  const stationsText = (ids: string[]) =>
    listText([...new Set(ids.map((id) => stations.get(id)?.name ?? id))].slice(0, 3), 'or');
  const holdings = $derived(new Map((ledger?.stock ?? []).map((entry) => [entry.item, entry])));
  const people = $derived(ledger?.players ?? []);
  const person = $derived(
    progressFor ? (people.find((entry) => String(entry.player.id) === progressFor) ?? null) : null
  );
  const stockNeedle = $derived(stockQuery.trim().toLowerCase());
  const stockShown = $derived(
    (ledger?.stock ?? []).filter(
      (entry) =>
        !stockNeedle ||
        (entry.name ?? entry.item).toLowerCase().includes(stockNeedle) ||
        (categoryLabel(entry.category) ?? '').toLowerCase().includes(stockNeedle)
    )
  );
  const baseShort = $derived(
    (ledger?.base?.requirements ?? []).map((entry) => {
      const held = holdings.get(entry.item)?.count ?? 0;
      return { ...entry, held, short: Math.max(0, entry.missing - held) };
    })
  );

  function add(kind: PlanKind, asset: string, count = 1) {
    const known = targets.find((target) => target.kind === kind && target.asset === asset);
    if (known) known.count = Math.min(maxCount, known.count + count);
    else if (targets.length < maxTargets) targets.push({ kind, asset, count });
    query = '';
  }

  function planBase() {
    for (const entry of baseShort) if (entry.short > 0) add('item', entry.item, entry.short);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }

  $effect(() => {
    const next = withParams(page.url, {
      plan: encodePlan(targets) || null,
      stock: useStock ? null : 'off',
      use: encodeChoices(choices) || null
    });
    if (next !== `${page.url.pathname}${page.url.search}`) {
      try {
        replaceState(next, {});
      } catch {
        return;
      }
    }
  });
</script>

<Meta title={t.ledger.title} description={t.ledger.description} />

<div class="flex flex-col gap-6">
  <PageHeader eyebrow={t.ledger.eyebrow} note={t.ledger.note}>
    {#snippet heading()}{t.ledger.title}{/snippet}
    {#snippet aside()}<Freshness source="save" at={ledger?.saved_at} />{/snippet}
  </PageHeader>

  {#if !data.ledger.ok}
    <ErrorNote error={data.ledger.error} what="the ledger" />
  {/if}

  <Card title={t.ledger.planTitle} description={t.ledger.planNote}>
    {#snippet actions()}
      {#if targets.length}
        <button class="btn" type="button" onclick={copyLink} aria-live="polite"
          >{copied ? t.ledger.copied : t.ledger.copyLink}</button
        >
        <button
          class="btn"
          type="button"
          onclick={() => {
            targets = [];
            choices.clear();
          }}>{t.ledger.clear}</button
        >
      {/if}
    {/snippet}
    <div class="flex flex-col gap-4">
      <div class="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label class="flex flex-col gap-1 text-xs text-ink-muted"
          >{t.ledger.search}
          <input
            class="field"
            type="search"
            placeholder={t.ledger.searchPlaceholder}
            disabled={!catalog}
            bind:value={query}
            onkeydown={(event) => {
              if (event.key === 'Enter' && results[0]) {
                event.preventDefault();
                add(results[0].kind, results[0].asset);
              }
            }}
          />
        </label>
        <div class="flex flex-wrap items-end gap-x-4 gap-y-2 text-sm">
          {#if people.length}
            <label class="flex min-w-36 flex-1 flex-col gap-1 text-xs text-ink-muted"
              >{t.ledger.planFor}
              <select class="field" disabled={!catalog} bind:value={progressFor}>
                <option value="">{t.ledger.group}</option>
                {#each people as entry (entry.player.id)}
                  <option value={String(entry.player.id)}>{entry.player.name}</option>
                {/each}
              </select>
            </label>
          {/if}
          <label class="flex min-h-9 items-center gap-2"
            ><input type="checkbox" bind:checked={useStock} /> {t.ledger.useStock}</label
          >
        </div>
      </div>

      {#if results.length}
        <ul class="grid gap-2 sm:grid-cols-2" aria-label={t.ledger.results}>
          {#each results as choice (`${choice.kind}:${choice.asset}`)}
            <li>
              <button
                type="button"
                class="flex w-full items-baseline justify-between gap-3 rounded-md border border-line px-3 py-2 text-left hover:border-accent"
                onclick={() => add(choice.kind, choice.asset)}
              >
                <span class="min-w-0 truncate text-ink">{choice.name}</span>
                <span class="chip shrink-0">{choice.category}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      {#if failed}
        <p class="note">{t.ledger.loadFailed}</p>
      {:else if !catalog}
        <p class="note">{t.ledger.loading}</p>
      {:else if targets.length === 0}
        <EmptyState message={t.ledger.emptyPlan} />
      {:else}
        <ul class="flex flex-col divide-y divide-line/70" aria-label={t.ledger.planTitle}>
          {#each targets as target (`${target.kind}:${target.asset}`)}
            <li class="flex flex-wrap items-center gap-3 py-2">
              <input
                class="field w-24"
                type="number"
                min="1"
                max={maxCount}
                aria-label={t.ledger.quantity(targetName(target))}
                value={target.count}
                oninput={(event) => {
                  const next = Math.floor(Number(event.currentTarget.value));
                  if (Number.isFinite(next) && next >= 1) target.count = Math.min(maxCount, next);
                }}
              />
              <span class="min-w-0 flex-1 truncate font-semibold">{targetName(target)}</span>
              <span class="chip">{target.kind === 'building' ? t.ledger.piece : t.ledger.item}</span
              >
              <button
                class="btn"
                type="button"
                aria-label={t.ledger.remove(targetName(target))}
                onclick={() => (targets = targets.filter((entry) => entry !== target))}>✕</button
              >
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </Card>

  {#if plan && catalog}
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div class="flex flex-col gap-6">
        <Card title={t.ledger.gatherTitle} description={t.ledger.gatherNote} flush>
          <table class="data-table">
            <thead>
              <tr>
                <th>{t.ledger.item}</th>
                <th class="num">{t.ledger.needed}</th>
                <th class="num">{t.ledger.carried}</th>
                <th class="num">{t.ledger.toGather}</th>
              </tr>
            </thead>
            <tbody>
              {#each plan.raw as need (need.item)}
                <tr>
                  <td data-label={t.ledger.item}>
                    <a class="text-ink hover:text-accent" href={`/map?find=item:${need.item}`}
                      >{itemName(need.item)}</a
                    >
                  </td>
                  <td class="num" data-label={t.ledger.needed}>{formatNumber(need.needed)}</td>
                  <td class="num" data-label={t.ledger.carried}
                    >{holdings.get(need.item)?.at_least ? '≥ ' : ''}{formatNumber(
                      need.fromStock
                    )}</td
                  >
                  <td
                    class="num {need.missing > 0 ? 'text-gold' : 'text-online'}"
                    data-label={t.ledger.toGather}>{formatNumber(need.missing)}</td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </Card>

        {#if plan.stocked.length}
          <Card title={t.ledger.fromStockTitle}>
            <ul class="flex flex-col gap-1 text-[0.875rem]">
              {#each plan.stocked as need (need.item)}
                <li class="flex justify-between gap-3">
                  <span>{itemName(need.item)}</span>
                  <span class="tabular">{formatNumber(need.fromStock)}</span>
                </li>
              {/each}
            </ul>
          </Card>
        {/if}

        {#if plan.xp.length}
          <Card title={t.ledger.xpTitle} description={t.ledger.xpNote}>
            <div class="grid grid-cols-2 gap-4">
              {#each plan.xp as gain (gain.skill)}
                {@const mine = person?.skills.find((entry) => entry.skill === gain.skill)}
                {@const after = mine ? levelFor(catalog.xp_for_level, mine.xp + gain.xp) : null}
                <Stat
                  label={skills.get(gain.skill) ?? gain.skill}
                  value={`+${formatNumber(Math.round(gain.xp))}`}
                  detail={mine && after !== null
                    ? after > mine.level
                      ? t.ledger.levels(mine.level, after)
                      : t.ledger.sameLevel(mine.level)
                    : ''}
                />
              {/each}
            </div>
            {#if !person}<p class="note mt-4">{t.ledger.pickPlayer}</p>{/if}
          </Card>
        {/if}
      </div>

      <Card title={t.ledger.craftTitle} description={t.ledger.craftNote}>
        <ol class="flex flex-col gap-4">
          {#each plan.steps as step (step.recipe)}
            {@const recipe = recipes.get(step.recipe)}
            {#if recipe}
              {@const output = recipe.creates.find((entry) => entry.item)}
              {@const knownBy = people.filter((entry) => entry.recipes.includes(recipe.asset))}
              <li class="flex flex-col gap-1.5 border-b border-line/60 pb-4 last:border-b-0">
                <p class="flex flex-wrap items-baseline gap-x-2">
                  <span class="font-display text-lg text-accent">{t.ledger.runs(step.runs)}</span>
                  <span class="font-semibold">{recipe.name ?? recipe.asset}</span>
                  {#if output && (output.count ?? 1) > 1}<span class="stat-label"
                      >{t.ledger.makes((output.count ?? 1) * step.runs)}</span
                    >{/if}
                </p>
                <p class="text-[0.8rem] text-ink-muted">
                  {recipe.consumes
                    .filter((entry) => entry.item)
                    .map(
                      (entry) =>
                        `${formatNumber((entry.count ?? 0) * step.runs)} ${itemName(entry.item!)}`
                    )
                    .join(' · ')}
                  ·
                  {recipe.stations.length
                    ? `${t.ledger.at} ${stationsText(recipe.stations)}`
                    : t.ledger.anywhere}
                </p>
                {#if (byOutput.get(step.item)?.length ?? 0) > 1}
                  <label class="flex flex-wrap items-center gap-2 text-[0.8rem] text-ink-muted"
                    >{t.ledger.recipe}
                    <select
                      class="field py-1"
                      value={recipe.asset}
                      onchange={(event) => choices.set(step.item, event.currentTarget.value)}
                    >
                      {#each byOutput.get(step.item) ?? [] as option (option.asset)}
                        <option value={option.asset}
                          >{inputsText(option)}{option.stations.length
                            ? ` (${stationsText(option.stations)})`
                            : ''}</option
                        >
                      {/each}
                    </select>
                  </label>
                {/if}
                {#if knownBy.length}
                  <p class="flex flex-wrap items-baseline gap-x-2 text-[0.8rem]">
                    <span class="stat-label">{t.ledger.knownBy}</span>
                    {#each knownBy as entry (entry.player.id)}<PlayerLink
                        player={entry.player}
                        quiet
                      />{/each}
                  </p>
                {:else}
                  <p class="text-[0.8rem] text-gold">{t.ledger.unknownToAll}</p>
                {/if}
                {#if recipe.unlock && (person ? !person.recipes.includes(recipe.asset) : knownBy.length < people.length)}
                  <div class="text-[0.8rem] text-ink-muted">
                    <span class="stat-label">{t.ledger.howToLearn}</span>
                    <UnlockSteps unlock={recipe.unlock} {person} />
                  </div>
                {/if}
              </li>
            {/if}
          {/each}
        </ol>
      </Card>
    </div>
  {/if}

  {#if ledger}
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card title={t.ledger.baseTitle} description={t.ledger.baseNote}>
        {#if !ledger.base}
          <p class="note">{t.ledger.noBase}</p>
        {:else}
          <div class="grid grid-cols-2 gap-4">
            <Stat label={t.ledger.pieces} value={formatNumber(ledger.base.pieces)} />
            <Stat label={t.ledger.unfinished} value={formatNumber(ledger.base.unfinished)} />
          </div>
          {#if baseShort.length === 0}
            <p class="note mt-4">{t.ledger.baseDone}</p>
          {:else}
            <table class="data-table mt-4">
              <thead>
                <tr>
                  <th>{t.ledger.item}</th>
                  <th class="num">{t.ledger.missing}</th>
                  <th class="num">{t.ledger.holds}</th>
                  <th class="num">{t.ledger.short}</th>
                </tr>
              </thead>
              <tbody>
                {#each baseShort as entry (entry.item)}
                  <tr>
                    <td data-label={t.ledger.item}>{entry.name ?? entry.item}</td>
                    <td class="num" data-label={t.ledger.missing}>{formatNumber(entry.missing)}</td>
                    <td class="num" data-label={t.ledger.holds}>{formatNumber(entry.held)}</td>
                    <td
                      class="num {entry.short > 0 ? 'text-gold' : 'text-online'}"
                      data-label={t.ledger.short}>{formatNumber(entry.short)}</td
                    >
                  </tr>
                {/each}
              </tbody>
            </table>
            {#if baseShort.some((entry) => entry.short > 0)}
              <button class="btn mt-4" type="button" disabled={!catalog} onclick={planBase}
                >{t.ledger.planBase}</button
              >
            {/if}
          {/if}
        {/if}
      </Card>

      <Card title={t.ledger.stockTitle} description={t.ledger.stockNote} flush>
        {#if ledger.stock.length === 0}
          <p class="note p-5">{t.ledger.stockEmpty}</p>
        {:else}
          <div class="border-b border-line p-4">
            <label class="flex flex-col gap-1 text-xs text-ink-muted"
              >{t.ledger.stockFilter}
              <input class="field" type="search" bind:value={stockQuery} />
            </label>
          </div>
          <div class="max-h-[32rem] overflow-y-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>{t.ledger.item}</th>
                  <th>{t.ledger.category}</th>
                  <th class="num">{t.ledger.held}</th>
                  <th>{t.ledger.carriedBy}</th>
                </tr>
              </thead>
              <tbody>
                {#each stockShown as entry (entry.item)}
                  <tr>
                    <td data-label={t.ledger.item}>{entry.name ?? entry.item}</td>
                    <td class="text-ink-muted" data-label={t.ledger.category}
                      >{categoryLabel(entry.category) ?? '—'}</td
                    >
                    <td
                      class="num"
                      data-label={t.ledger.held}
                      title={entry.at_least ? t.ledger.atLeast : undefined}
                      >{entry.at_least ? '≥ ' : ''}{formatNumber(entry.count)}</td
                    >
                    <td data-label={t.ledger.carriedBy}>
                      <span class="flex flex-wrap gap-x-3">
                        {#each entry.holders as holder (holder.player.id)}
                          <span
                            ><PlayerLink player={holder.player} quiet />
                            <span class="text-ink-muted"
                              >{holder.at_least ? '≥' : ''}{formatNumber(holder.count)}</span
                            ></span
                          >
                        {/each}
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </Card>
    </div>
  {/if}
</div>
