<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import type { Journal } from '$lib/api/types';
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatNumber } from '$lib/ui/format';
  import Freshness from '$lib/ui/Freshness.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import Meter from '$lib/ui/Meter.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import PlayerLink from '$lib/ui/PlayerLink.svelte';
  import { groupBy } from '$lib/ui/lists';
  import { withParams } from '$lib/ui/query';
  import { humanize, t } from '$lib/ui/strings';
  import Time from '$lib/ui/Time.svelte';
  import UnlockSteps from '$lib/ui/UnlockSteps.svelte';

  type Entry = Journal['entries'][number];
  type Show = 'all' | 'missing' | 'found';

  let { data } = $props();

  const journal = $derived(data.journal.ok ? data.journal.data : null);
  const people = $derived(data.ledger.ok ? data.ledger.data.players : []);
  const players = $derived(journal?.players ?? []);
  const names = $derived(new Map(players.map((entry) => [entry.player.id, entry.player])));
  const order = (category: string) => ['World', 'Knowledge', 'Recipes'].indexOf(category) + 1 || 9;
  const categories = $derived(
    [...new Set((journal?.entries ?? []).map((entry) => entry.category ?? t.journal.other))].sort(
      (a, b) => order(a) - order(b) || a.localeCompare(b)
    )
  );

  const initial = untrack(() => page.url.searchParams);
  let category = $state(initial.get('category') ?? 'World');
  let whose = $state(initial.get('player') ?? '');
  let show = $state<Show>(
    (['all', 'missing', 'found'] as const).find((value) => value === initial.get('show')) ?? 'all'
  );
  let query = $state(initial.get('q') ?? '');
  let limit = $state(120);
  let ready = $state(false);

  onMount(() => {
    ready = true;
  });

  const chosen = $derived(whose ? Number(whose) : null);
  const person = $derived(
    chosen === null ? null : (people.find((entry) => entry.player.id === chosen) ?? null)
  );
  const isFound = (entry: Entry) =>
    chosen === null ? entry.found_by.length > 0 : entry.found_by.includes(chosen);
  const needle = $derived(query.trim().toLowerCase());
  const inCategory = $derived(
    (journal?.entries ?? []).filter((entry) => (entry.category ?? t.journal.other) === category)
  );
  const matching = $derived(
    inCategory.filter(
      (entry) =>
        (show === 'all' || (show === 'found') === isFound(entry)) &&
        (!needle ||
          [entry.name, entry.item_name, entry.creature, entry.asset].some((value) =>
            value?.toLowerCase().includes(needle)
          ))
    )
  );
  const shown = $derived(matching.slice(0, limit));
  const groups = $derived(
    groupBy(shown, groupName).map(([name, entries]) => ({
      name,
      entries,
      found: inCategory.filter((entry) => groupName(entry) === name && isFound(entry)).length,
      total: inCategory.filter((entry) => groupName(entry) === name).length
    }))
  );
  const groupFound = $derived(
    (journal?.entries ?? []).filter((entry) => entry.found_by.length > 0).length
  );
  const categoryCounts = $derived(
    new Map(
      categories.map((name) => {
        const entries = (journal?.entries ?? []).filter(
          (entry) => (entry.category ?? t.journal.other) === name
        );
        return [name, { found: entries.filter(isFound).length, total: entries.length }];
      })
    )
  );

  function groupName(entry: Entry): string {
    const group = entry.group?.split('/').filter((part) => part !== entry.category);
    return group?.length ? humanize(group.join(' · ')) : t.journal.other;
  }

  function hint(entry: Entry): string | null {
    const hints = t.journal.hints;
    switch (entry.unlock) {
      case 'RecipeUnlocked':
        return entry.recipe_unlock === null ? hints.RecipeUnlocked : null;
      case 'ItemFirstPickup':
        return hints.ItemFirstPickup(entry.item_name ?? entry.name ?? humanize(entry.asset));
      case 'AIKill':
        return entry.creature ? hints.AIKill(entry.creature) : hints.unknown;
      case 'Interaction':
        return entry.creature ? hints.Interaction(entry.creature) : hints.unknown;
      case 'PlayerStart':
        return hints.PlayerStart;
      default:
        return entry.find?.startsWith('lore:') ? hints.lore : hints.unknown;
    }
  }

  $effect(() => {
    const next = withParams(page.url, {
      category: category === 'World' ? null : category,
      player: whose || null,
      show: show === 'all' ? null : show,
      q: query.trim() || null
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

<Meta title={t.journal.title} description={t.journal.description} />

<div class="flex flex-col gap-6">
  <PageHeader eyebrow={t.journal.eyebrow} note={t.journal.note}>
    {#snippet heading()}{t.journal.title}{/snippet}
    {#snippet aside()}<Freshness source="save" at={journal?.saved_at} />{/snippet}
  </PageHeader>

  {#if !data.journal.ok}
    <ErrorNote error={data.journal.error} what="the journal" />
  {:else if journal && players.length === 0}
    <EmptyState message={t.journal.empty} />
  {:else if journal}
    <section class="card rise rise-2 grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div class="flex flex-col gap-2">
        <span class="stat-label">{t.journal.group}</span>
        <span class="stat-value stat-value-lg"
          >{t.journal.ofTotal(formatNumber(groupFound), formatNumber(journal.entries.length))}</span
        >
        <div class="progress-track">
          <span
            class="progress-fill"
            style:width={`${(groupFound / Math.max(1, journal.entries.length)) * 100}%`}
          ></span>
        </div>
      </div>
      <div class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {#each players as entry (entry.player.id)}
          <Meter label={entry.player.name} value={entry.found} total={journal.entries.length} />
        {/each}
      </div>
    </section>

    <Card flush>
      <div class="flex flex-col gap-4 border-b border-line p-4">
        <nav class="flex flex-wrap gap-1" aria-label={t.journal.categories}>
          {#each categories as name (name)}
            {@const counts = categoryCounts.get(name)}
            <button
              type="button"
              class="seg"
              disabled={!ready}
              aria-current={name === category ? 'true' : undefined}
              onclick={() => {
                category = name;
                limit = 120;
              }}
              >{name}
              {#if counts}<span class="ml-1.5 text-ink-muted">{counts.found}/{counts.total}</span
                >{/if}</button
            >
          {/each}
        </nav>
        <div class="grid gap-3 sm:grid-cols-3">
          <label class="flex flex-col gap-1 text-xs text-ink-muted"
            >{t.journal.whose}
            <select class="field" disabled={!ready} bind:value={whose}>
              <option value="">{t.journal.group}</option>
              {#each players as entry (entry.player.id)}
                <option value={String(entry.player.id)}>{entry.player.name}</option>
              {/each}
            </select>
          </label>
          <label class="flex flex-col gap-1 text-xs text-ink-muted"
            >{t.journal.show}
            <select class="field" disabled={!ready} bind:value={show}>
              {#each ['all', 'missing', 'found'] as const as value (value)}
                <option {value}>{t.journal.shows[value]}</option>
              {/each}
            </select>
          </label>
          <label class="flex flex-col gap-1 text-xs text-ink-muted"
            >{t.journal.search}
            <input
              class="field"
              type="search"
              placeholder={t.journal.searchPlaceholder}
              disabled={!ready}
              bind:value={query}
            />
          </label>
        </div>
        <p class="note" aria-live="polite">{t.journal.matches(shown.length, matching.length)}</p>
      </div>

      {#if groups.length === 0}
        <p class="note p-5">{t.journal.none}</p>
      {:else}
        <div class="flex flex-col">
          {#each groups as group (group.name)}
            <section class="border-b border-line last:border-b-0" aria-label={group.name}>
              <h2 class="flex items-baseline justify-between gap-3 px-5 pt-5 pb-2">
                <span class="rail">{group.name}</span>
                <span class="stat-label"
                  >{t.journal.ofTotal(formatNumber(group.found), formatNumber(group.total))}</span
                >
              </h2>
              <ul class="grid gap-x-6 px-5 pb-4 md:grid-cols-2">
                {#each group.entries as entry (entry.asset)}
                  {@const found = isFound(entry)}
                  {@const unlock =
                    entry.recipe_unlock === null ? null : journal.unlocks[entry.recipe_unlock]}
                  <li
                    class="flex flex-col gap-1 border-b border-line/60 py-3 text-[0.875rem]"
                    data-found={found ? 'true' : 'false'}
                  >
                    <p class="flex flex-wrap items-baseline gap-x-2">
                      <span class="font-semibold {found ? 'text-ink' : 'text-ink-muted'}"
                        >{entry.name ?? humanize(entry.asset)}</span
                      >
                      {#if found}<span class="chip text-online">{t.journal.found}</span>{/if}
                    </p>
                    {#if entry.found_by.length}
                      <p class="flex flex-wrap items-baseline gap-x-2 text-[0.8rem]">
                        {#each entry.found_by as id (id)}
                          {@const who = names.get(id)}
                          {#if who}<PlayerLink player={who} quiet />{/if}
                        {/each}
                        {#if entry.first_found && names.get(entry.first_found.player)}
                          <span class="text-ink-muted"
                            >· {t.journal.firstFound(names.get(entry.first_found.player)!.name)}
                            <Time at={entry.first_found.at} mode="relative" /></span
                          >
                        {/if}
                      </p>
                    {/if}
                    {#if !found}
                      <div class="text-[0.8rem] text-ink-muted">
                        {#if chosen !== null && person === null && names.get(chosen)}
                          <p>{t.journal.notFoundBy(names.get(chosen)!.name)}</p>
                        {/if}
                        {#if unlock}
                          <UnlockSteps {unlock} {person} />
                        {:else if hint(entry)}
                          <p>{hint(entry)}</p>
                        {/if}
                        {#if entry.regions.length || entry.find}
                          <p class="mt-1 flex flex-wrap gap-x-3">
                            {#each entry.regions as area (area)}
                              <a
                                class="text-accent hover:underline"
                                href={`/map?area=${encodeURIComponent(area)}`}
                                >{t.journal.inArea} {area}</a
                              >
                            {/each}
                            {#if entry.find}
                              <a
                                class="text-accent hover:underline"
                                href={`/map?find=${encodeURIComponent(entry.find)}`}
                                >{t.journal.onMap} <span aria-hidden="true">↗</span></a
                              >
                            {/if}
                          </p>
                        {/if}
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>
            </section>
          {/each}
        </div>
        {#if matching.length > shown.length}
          <div class="border-t border-line p-4">
            <button class="btn" type="button" disabled={!ready} onclick={() => (limit += 120)}
              >{t.journal.more(Math.min(120, matching.length - shown.length))}</button
            >
          </div>
        {/if}
      {/if}
    </Card>
  {/if}
</div>
