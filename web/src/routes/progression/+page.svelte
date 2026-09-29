<script lang="ts">
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatNumber } from '$lib/ui/format';
  import Freshness from '$lib/ui/Freshness.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import Meter from '$lib/ui/Meter.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import PlayerLink from '$lib/ui/PlayerLink.svelte';
  import { t } from '$lib/ui/strings';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  const progression = $derived(data.progression.ok ? data.progression.data : null);
  const players = $derived(
    [...(progression?.players ?? [])].sort(
      (a, b) =>
        (b.total_level ?? 0) - (a.total_level ?? 0) || a.player.name.localeCompare(b.player.name)
    )
  );
  const newest = $derived(
    players.reduce<string | null>(
      (latest, entry) => (!latest || entry.saved_at > latest ? entry.saved_at : latest),
      null
    )
  );
  const skills = $derived(
    players[0]?.skills.map((skill) => ({ id: skill.id, name: skill.name })) ?? []
  );
  const best = $derived(
    new Map(
      skills.map((skill) => [
        skill.id,
        Math.max(
          0,
          ...players.map((entry) => entry.skills.find((item) => item.id === skill.id)?.level ?? 0)
        )
      ])
    )
  );
  const levelOf = (entry: (typeof players)[number], id: string) =>
    entry.skills.find((item) => item.id === id)?.level ?? null;
  const areaName = (area: string | null) => area ?? t.progression.otherArea;
</script>

<Meta title={t.progression.title} description={t.progression.description} />

<div class="flex flex-col gap-6">
  <PageHeader eyebrow={t.progression.eyebrow} note={t.progression.note}>
    {#snippet heading()}{t.progression.title}{/snippet}
    {#snippet aside()}<Freshness source="save" at={newest} />{/snippet}
  </PageHeader>

  {#if !data.progression.ok}
    <ErrorNote error={data.progression.error} what="progression" />
  {:else if progression && players.length === 0}
    <EmptyState message={t.progression.empty} />
  {:else if progression}
    <ol class="rise rise-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Adventurers">
      {#each players as entry, index (entry.player.id)}
        <li class="card flex flex-col gap-4 p-5">
          <header class="flex items-baseline justify-between gap-3">
            <h2 class="min-w-0 truncate font-display text-xl">
              <PlayerLink player={entry.player} />
            </h2>
            <span class="chip">{t.progression.rank(index + 1)}</span>
          </header>
          <div class="flex items-baseline gap-3">
            <span class="stat-value stat-value-lg">{formatNumber(entry.total_level)}</span>
            <span class="stat-label">{t.progression.totalLevel}</span>
          </div>
          <div class="flex flex-col gap-3">
            <Meter
              label={t.progression.quests}
              value={entry.quests.completed}
              total={progression.totals.quests}
              detail={t.progression.mainQuests(entry.quests.main_completed)}
            />
            <Meter
              label={t.progression.journal}
              value={entry.journal}
              total={progression.totals.journal}
            />
            <Meter
              label={t.progression.recipes}
              value={entry.recipes}
              total={progression.totals.recipes}
            />
            <Meter
              label={t.progression.buildings}
              value={entry.buildings}
              total={progression.totals.buildings}
            />
            <div class="flex items-baseline justify-between gap-3">
              <span class="stat-label">{t.progression.creatures}</span>
              <span class="tabular text-[0.8rem]">{t.progression.kinds(entry.creatures)}</span>
            </div>
          </div>
          {#if entry.bosses.length}
            <ul class="flex flex-wrap gap-1.5" aria-label={t.progression.bossesTitle}>
              {#each entry.bosses as boss (boss)}<li class="chip text-gold">{boss}</li>{/each}
            </ul>
          {/if}
          {#if entry.latest}
            <p class="mt-auto border-t border-line pt-3 text-[0.8rem] text-ink-muted">
              {t.progression.latest[entry.latest.kind](entry.latest.name ?? t.progression.unnamed)}
              · <Time at={entry.latest.at} mode="relative" />
            </p>
          {/if}
        </li>
      {/each}
    </ol>

    <Card title={t.progression.skillsTitle} description={t.progression.skillsNote} flush>
      <div class="relative overflow-x-auto">
        <table class="data-table skill-table matrix">
          <thead>
            <tr>
              <th>{t.progression.player}</th>
              {#each skills as skill (skill.id)}<th class="num skill-head"
                  ><span>{skill.name}</span></th
                >{/each}
              <th class="num">{t.progression.totalLevel}</th>
            </tr>
          </thead>
          <tbody>
            {#each players as entry (entry.player.id)}
              <tr>
                <td data-label={t.progression.player}><PlayerLink player={entry.player} /></td>
                {#each skills as skill (skill.id)}
                  {@const level = levelOf(entry, skill.id)}
                  <td
                    class="num"
                    data-label={skill.name}
                    class:top={level !== null && level > 1 && level === best.get(skill.id)}
                  >
                    {level ??
                      '—'}{#if level !== null && level > 1 && level === best.get(skill.id)}<span
                        class="sr-only">, {t.progression.highest}</span
                      >{/if}
                  </td>
                {/each}
                <td class="num font-semibold" data-label={t.progression.totalLevel}
                  >{formatNumber(entry.total_level)}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card title={t.progression.areasTitle} description={t.progression.areasNote} flush>
        <div class="relative overflow-x-auto">
          <table class="data-table matrix">
            <thead>
              <tr>
                <th>{t.progression.player}</th>
                {#each progression.totals.areas as area (area.area ?? '')}
                  <th class="num">
                    {areaName(area.area)}
                    <span class="block font-normal tracking-normal normal-case"
                      >{t.progression.questCount(area.quests)}</span
                    >
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each players as entry (entry.player.id)}
                <tr>
                  <td data-label={t.progression.player}><PlayerLink player={entry.player} /></td>
                  {#each progression.totals.areas as area, index (area.area ?? '')}
                    {@const done = entry.quests.areas[index]?.completed ?? 0}
                    <td
                      class="num {done > 0 && done === area.quests
                        ? 'text-gold'
                        : done
                          ? ''
                          : 'text-ink-muted'}"
                      data-label={areaName(area.area)}>{done}{` / ${area.quests}`}</td
                    >
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t.progression.bossesTitle} description={t.progression.bossesNote}>
        <ul class="flex flex-col gap-4">
          {#each progression.bosses as boss (boss)}
            {@const slayers = players.filter((entry) => entry.bosses.includes(boss))}
            <li class="flex flex-col gap-1.5">
              <span class="font-display text-lg {slayers.length ? 'text-gold' : ''}">{boss}</span>
              {#if slayers.length}
                <span class="flex flex-wrap gap-x-3 gap-y-1 text-[0.85rem]">
                  {#each slayers as entry (entry.player.id)}<PlayerLink
                      player={entry.player}
                    />{/each}
                </span>
              {:else}
                <span class="note">{t.progression.unbeaten}</span>
              {/if}
            </li>
          {/each}
        </ul>
      </Card>
    </div>
  {/if}
</div>

<style>
  .skill-table td.top {
    color: var(--color-gold);
    font-weight: 700;
  }
  .skill-table th.skill-head {
    vertical-align: bottom;
    padding-inline: 0.35rem;
  }
  .skill-table th.skill-head span {
    display: inline-block;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }
  .skill-table td.num {
    padding-inline: 0.5rem;
  }
  @media (max-width: 639px) {
    .matrix {
      display: table;
      font-size: 0.8rem;
    }
    .matrix thead {
      position: static;
      width: auto;
      height: auto;
      overflow: visible;
      clip: auto;
    }
    .matrix tbody {
      display: table-row-group;
    }
    .matrix tr {
      display: table-row;
      margin: 0;
      border: 0;
      background: none;
    }
    .matrix th,
    .matrix td {
      display: table-cell;
      padding: 0.45rem 0.5rem;
      white-space: nowrap;
    }
    .matrix td[data-label]::before {
      content: none;
    }
  }
</style>
