<script lang="ts">
  import { page } from '$app/state';
  import Card from '$lib/ui/Card.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatBytes, formatHour, formatHours, formatNumber } from '$lib/ui/format';
  import Freshness from '$lib/ui/Freshness.svelte';
  import { useLive } from '$lib/ui/live.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import PlayerCountChart from '$lib/ui/PlayerCountChart.svelte';
  import { withParams } from '$lib/ui/query';
  import { humanize, t } from '$lib/ui/strings';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  const live = useLive();
  const status = $derived(live.status ?? data.status);
  const world = $derived(data.world.ok ? data.world.data : null);
  const save = $derived(world?.save ?? null);

  const yesNo = (value: boolean | null) =>
    value === null ? '—' : value ? t.world.yes : t.world.no;

  const layers = $derived(status?.collector.layers ?? null);
  const capabilities = $derived(
    layers
      ? (['logs', 'saves', 'process', 'mod'] as const).map((key) => ({
          key,
          on: layers[key],
          ...t.world.layers[key]
        }))
      : []
  );
  const totals = $derived(
    world
      ? [
          { label: t.world.totals.players, value: formatNumber(world.totals.players) },
          { label: t.world.totals.sessions, value: formatNumber(world.totals.sessions) },
          { label: t.world.totals.played, value: formatHours(world.totals.playtime_s) },
          { label: t.world.totals.deaths, value: formatNumber(world.totals.deaths) },
          { label: t.world.totals.levelUps, value: formatNumber(world.totals.level_ups) },
          { label: t.world.totals.journal, value: formatNumber(world.totals.journal_entries) },
          { label: t.world.totals.quests, value: formatNumber(world.totals.quests_completed) }
        ]
      : []
  );
</script>

<Meta title={t.world.title} description={t.world.description} />

<div class="flex flex-col gap-6">
  <PageHeader eyebrow={t.world.eyebrow} note={t.world.note}>
    {#snippet heading()}{world?.world_name ?? world?.name ?? t.world.title}{/snippet}
    {#snippet aside()}
      {#if world?.tracking_since}
        <p class="ticker">
          {t.world.trackingSince}
          <Time at={world.tracking_since} mode="date" />
        </p>
      {/if}
    {/snippet}
  </PageHeader>

  {#if !world && !data.world.ok}
    <ErrorNote error={data.world.error} what="the world" />
  {/if}

  {#if world}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {#each totals as stat (stat.label)}
        <div class="card flex flex-col gap-0.5 px-4 py-3">
          <span class="stat-label">{stat.label}</span>
          <span class="stat-value">{stat.value}</span>
        </div>
      {/each}
    </div>
  {/if}

  <Card title={t.world.playersOverTime}>
    {#snippet actions()}
      {#each ['24h', '7d', '30d'] as range (range)}
        <a
          href={withParams(page.url, { range })}
          class="seg"
          aria-current={data.range === range ? 'true' : undefined}>{range}</a
        >
      {/each}
    {/snippet}
    {#if data.history.ok}
      <PlayerCountChart history={data.history.data} maxPlayers={world?.max_players ?? null} />
    {:else}
      <ErrorNote error={data.history.error} what="the history" />
    {/if}
  </Card>

  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <Card title={t.world.saveTitle} description={t.world.saveNote}>
      {#snippet actions()}
        <Freshness source="save" at={save?.saved_at} />
      {/snippet}
      {#if save}
        <dl class="charfile">
          <dt>{t.world.day}</dt>
          <dd>{save.day === null ? '—' : formatNumber(save.day)}</dd>
          <dt>{t.world.timeOfDay}</dt>
          <dd>{formatHour(save.time_of_day) || '—'}</dd>
          <dt>{t.world.difficulty}</dt>
          <dd>{save.difficulty ? humanize(save.difficulty) : '—'}</dd>
          <dt>{t.world.hardcore}</dt>
          <dd>{yesNo(save.hardcore)}</dd>
          <dt>{t.world.friendlyFire}</dt>
          <dd>{yesNo(save.friendly_fire)}</dd>
          <dt>{t.world.saveSize}</dt>
          <dd>{save.size_bytes === null ? '—' : formatBytes(save.size_bytes)}</dd>
        </dl>
        {#if save.buildings}
          <h3 class="rail mt-5 text-[0.9rem]">Buildings</h3>
          <p class="mt-2 text-sm">
            {formatNumber(save.buildings.total)} saved pieces · {formatNumber(
              save.buildings.unfinished
            )} unfinished
          </p>
        {/if}
        {#if save.progress}
          <h3 class="rail mt-5 text-[0.9rem]">World progress</h3>
          <p class="mt-2 text-sm">
            World hooks triggered: {formatNumber(save.progress.world_hooks.length)} · Bosses defeated:
            {formatNumber(save.progress.defeated_bosses.length)}
          </p>
          {#if data.defeatedBosses.length}
            <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {#each data.defeatedBosses as boss (boss.id)}<li>{boss.name}</li>{/each}
            </ul>
          {/if}
          {#if save.progress.values.length}
            <details class="mt-2 text-sm">
              <summary class="cursor-pointer py-2 text-accent">Saved progress values</summary>
              <dl class="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2">
                {#each save.progress.values as entry (entry.tag)}<dt class="break-words">
                    {entry.tag}
                  </dt>
                  <dd>{formatNumber(entry.value)}</dd>{/each}
              </dl>
            </details>
          {/if}
        {/if}
        <h3 class="rail mt-5 text-[0.9rem]">{t.world.weatherTitle}</h3>
        {#if save.weather.length === 0}
          <p class="note mt-2">{t.world.weatherEmpty}</p>
        {:else}
          <ul class="mt-2 flex flex-col gap-1 text-[0.875rem]">
            {#each save.weather as entry (entry.region)}
              <li class="flex flex-wrap items-baseline gap-x-3">
                <span class="min-w-24 font-semibold">{humanize(entry.region)}</span>
                <span>{humanize(entry.type)}</span>
                {#if entry.day_count !== null}<span class="text-ink-muted"
                    >{t.world.day} {formatNumber(entry.day_count)}</span
                  >{/if}
              </li>
            {/each}
          </ul>
        {/if}
        <h3 class="rail mt-5 text-[0.9rem]">{t.world.eventsTitle}</h3>
        {#if save.events.length === 0}
          <p class="note mt-2">{t.world.eventsEmpty}</p>
        {:else}
          <ul class="mt-2 flex flex-col gap-1 text-[0.875rem]">
            {#each save.events as entry (entry.id)}
              <li class="flex flex-wrap items-baseline gap-x-3">
                <span class="font-semibold">{entry.name ?? humanize(entry.id)}</span>
                {#if entry.state}<span class="text-ink-muted">{humanize(entry.state)}</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      {:else}
        <p class="note">{t.world.noSave}</p>
      {/if}
    </Card>

    <div class="flex flex-col gap-6">
      <Card title={t.world.serverTitle}>
        {#if world}
          <dl class="charfile">
            <dt>{t.world.serverName}</dt>
            <dd>{world.name ?? '—'}</dd>
            <dt>{t.world.worldName}</dt>
            <dd>{world.world_name ?? '—'}</dd>
            <dt>{t.world.version}</dt>
            <dd>{world.version ?? '—'}</dd>
            <dt>{t.world.maxPlayers}</dt>
            <dd>{world.max_players ?? '—'}</dd>
          </dl>
        {/if}
      </Card>

      <Card title="A guide to the wilds" description="Names and places from the game build.">
        <p class="mb-4 text-sm text-ink-muted">
          Dragonwilds {data.mapGuide.version} · build {data.mapGuide.build}
        </p>
        <div class="flex flex-col gap-4 text-sm">
          <details>
            <summary class="cursor-pointer py-2 font-semibold text-accent"
              >{data.mapGuide.regions.length} regions</summary
            >
            <ul class="mt-2 grid gap-2 sm:grid-cols-2">
              {#each data.mapGuide.regions as region (region.id)}
                <li>{region.name}</li>
              {/each}
            </ul>
          </details>
          <details>
            <summary class="cursor-pointer py-2 font-semibold text-accent"
              >{data.mapGuide.lodestones.length} fixed lodestones</summary
            >
            <ul class="mt-2 flex flex-col gap-2">
              {#each data.mapGuide.lodestones as stone (stone.id)}
                <li>{stone.name}{stone.regions.length ? ` · ${stone.regions.join(' / ')}` : ''}</li>
              {/each}
            </ul>
            <p class="mt-2 text-xs text-ink-muted">
              Map regions may overlap. These fixed landmarks are game data.
            </p>
          </details>
          <details>
            <summary class="cursor-pointer py-2 font-semibold text-accent">Boss names</summary>
            <ul class="mt-2 flex flex-col gap-2">
              {#each data.mapGuide.bosses as boss (boss)}
                <li>{boss}</li>
              {/each}
            </ul>
          </details>
        </div>
      </Card>

      <Card title={t.world.seesTitle}>
        {#if capabilities.length === 0}
          <p class="note">{t.world.seesEmpty}</p>
        {:else}
          <ul class="flex flex-col gap-2.5 text-[0.875rem]">
            {#each capabilities as capability (capability.key)}
              <li class="flex gap-3">
                <span
                  class="lamp mt-1.5 {capability.on ? 'text-online' : 'text-line-strong'}"
                  aria-hidden="true"
                ></span>
                <div>
                  <p class="font-semibold {capability.on ? '' : 'text-ink-muted'}">
                    {capability.name}{capability.on ? '' : t.world.notRead}
                  </p>
                  <p class="text-[0.74rem] text-ink-muted">{capability.detail}</p>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </Card>
    </div>
  </div>
</div>
