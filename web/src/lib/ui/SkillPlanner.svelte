<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import type { Catalog, PlayerCharacter } from '$lib/api/types';
  import { formatNumber } from './format';
  import { daysAtPace, timesFor, xpFor, xpNeeded } from './levels';
  import { t } from './strings';

  let { character, player }: { character: PlayerCharacter; player: number } = $props();

  let chosen = $state('');
  let target = $state<number | null>(null);
  let catalog = $state<Catalog | null>(null);
  let known = $state<Set<string> | null>(null);
  let ready = $state(false);

  onMount(() => {
    ready = true;
    api
      .getCatalog()
      .then((loaded) => {
        catalog = loaded;
      })
      .catch(() => {
        catalog = null;
      });
    api
      .getLedger()
      .then((ledger) => {
        const mine = ledger.players.find((entry) => entry.player.id === player);
        known = mine ? new Set([...mine.recipes, ...mine.buildings]) : null;
      })
      .catch(() => {
        known = null;
      });
  });

  const skills = $derived(
    character.skills.filter((skill) => skill.name !== null && skill.level !== null)
  );
  const gains = $derived(new Map(character.xp_gains.map((gain) => [gain.id, gain])));
  const busiest = $derived(
    [...skills].sort((a, b) => (gains.get(b.id)?.week ?? 0) - (gains.get(a.id)?.week ?? 0))[0]
  );
  const skill = $derived(skills.find((entry) => entry.id === chosen) ?? busiest ?? null);
  const curve = $derived(catalog?.xp_for_level ?? null);
  const maxLevel = $derived(curve?.length ?? 99);
  const level = $derived(skill?.level ?? 1);
  const goal = $derived(Math.min(maxLevel, Math.max(level + 1, target ?? level + 1)));
  const needed = $derived(
    !skill
      ? null
      : curve
        ? xpNeeded(curve, skill.xp, goal)
        : goal === level + 1 && skill.next_level_xp !== null
          ? Math.max(0, skill.next_level_xp - skill.xp)
          : null
  );
  const goalXp = $derived(curve ? xpFor(curve, goal) : (skill?.next_level_xp ?? null));
  const share = $derived(
    skill && goalXp ? Math.max(0, Math.min(1, skill.xp / Math.max(1, goalXp))) : 0
  );
  const week = $derived(skill ? (gains.get(skill.id)?.week ?? 0) : 0);
  const days = $derived(needed === null ? null : daysAtPace(needed, week));
  const sources = $derived.by(() => {
    if (!catalog || !skill || needed === null) return [];
    const asset = catalog.skills.find((entry) => entry.id === skill.id)?.asset;
    if (!asset) return [];
    const items = new Map(catalog.items.map((item) => [item.asset, item.name]));
    const rows = [
      ...catalog.recipes.flatMap((recipe) => {
        const each = recipe.xp.find((gain) => gain.skill === asset)?.xp ?? 0;
        const output = recipe.creates.find((entry) => entry.item)?.item;
        const name = recipe.name ?? (output ? items.get(output) : null);
        return each > 0 && name && recipe.creates.some((entry) => entry.item)
          ? [{ key: recipe.asset, name, each, verb: t.player.planner.craft }]
          : [];
      }),
      ...catalog.buildings.flatMap((piece) => {
        const each = piece.xp.find((gain) => gain.skill === asset)?.xp ?? 0;
        return each > 0 && piece.name
          ? [{ key: piece.asset, name: piece.name, each, verb: t.player.planner.build }]
          : [];
      })
    ].map((row) => ({
      ...row,
      known: known?.has(row.key) ?? false,
      times: timesFor(needed, row.each)
    }));
    return rows
      .sort(
        (a, b) =>
          Number(b.known) - Number(a.known) || b.each - a.each || a.name.localeCompare(b.name)
      )
      .slice(0, 6);
  });
</script>

{#if !skill}
  <p class="note">{t.player.skillsEmpty}</p>
{:else}
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1 text-xs text-ink-muted"
        >{t.player.planner.skill}
        <select
          class="field"
          disabled={!ready}
          value={skill.id}
          onchange={(event) => {
            chosen = event.currentTarget.value;
            target = null;
          }}
        >
          {#each skills as entry (entry.id)}
            <option value={entry.id}>{entry.name} · {entry.level}</option>
          {/each}
        </select>
      </label>
      <label class="flex flex-col gap-1 text-xs text-ink-muted"
        >{t.player.planner.target}
        <input
          class="field"
          type="number"
          disabled={!ready}
          min={level + 1}
          max={maxLevel}
          value={goal}
          oninput={(event) => {
            const next = Math.floor(Number(event.currentTarget.value));
            if (Number.isFinite(next)) target = next;
          }}
        />
      </label>
    </div>
    {#if level >= maxLevel}
      <p class="note">{t.player.planner.maxed(skill.name ?? '')}</p>
    {:else if needed !== null}
      <div class="flex flex-col gap-1.5">
        <p class="flex flex-wrap items-baseline justify-between gap-x-3">
          <span class="stat-value">{t.player.planner.needs(formatNumber(Math.ceil(needed)))}</span>
          <span class="stat-label">{t.player.planner.toLevel(goal)}</span>
        </p>
        <div class="progress-track">
          <span class="progress-fill" style:width={`${share * 100}%`}></span>
        </div>
        <p class="text-[0.8rem] text-ink-muted">
          {days === null
            ? t.player.planner.noPace
            : t.player.planner.pace(formatNumber(Math.round(week)), days)}
        </p>
      </div>
      {#if sources.length}
        <div>
          <h3 class="stat-label mb-2">{t.player.planner.sources}</h3>
          <ul class="flex flex-col gap-1.5 text-[0.85rem]">
            {#each sources as source (source.key)}
              <li class="flex flex-wrap items-baseline justify-between gap-x-3">
                <span class="min-w-0"
                  >{source.verb} <span class="font-semibold">{source.name}</span>
                  {#if source.known}<span class="chip text-online">{t.player.planner.known}</span
                    >{/if}</span
                >
                <span class="tabular text-ink-muted"
                  >{source.times === null ? '' : `${formatNumber(source.times)} ×`} · {formatNumber(
                    source.each
                  )} xp</span
                >
              </li>
            {/each}
          </ul>
        </div>
      {:else if catalog}
        <p class="text-[0.8rem] text-ink-muted">{t.player.planner.noSources}</p>
      {/if}
    {/if}
  </div>
{/if}
