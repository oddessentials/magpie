<script lang="ts">
  import { mergeActivity } from '$lib/ui/activity';
  import ActivityFeed from '$lib/ui/ActivityFeed.svelte';
  import Card from '$lib/ui/Card.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatNumber } from '$lib/ui/format';
  import Freshness from '$lib/ui/Freshness.svelte';
  import { useLive } from '$lib/ui/live.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PlatformTag from '$lib/ui/PlatformTag.svelte';
  import PlayerCountChart from '$lib/ui/PlayerCountChart.svelte';
  import PlayerLink from '$lib/ui/PlayerLink.svelte';
  import SetupSteps from '$lib/ui/SetupSteps.svelte';
  import { t } from '$lib/ui/strings';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  const live = useLive();
  const status = $derived(live.status ?? data.status);
  const online = $derived(live.online ?? (data.online.ok ? data.online.data : null));
  const activity = $derived(
    mergeActivity(live.activity, data.activity.ok ? data.activity.data.items : []).slice(0, 14)
  );
  const players = $derived(online?.players ?? []);
  const fresh = $derived(status?.collector.state === 'none');

  const headline = $derived.by(() => {
    if (!status || status.state === 'unknown') return t.today.headline.unknown;
    if (status.state === 'offline') return t.today.headline.offline;
    if (players.length === 0) return t.today.headline.empty;
    if (players.length === 1) return t.today.headline.one;
    return t.today.headline.many(formatNumber(players.length));
  });
</script>

<Meta title="Today" description={t.site.description(data.siteName)} />

<div class="flex flex-col gap-8">
  <header class="today-hero rise">
    <picture class="today-art" aria-hidden="true">
      <source
        type="image/avif"
        srcset="/art/wilds-800.avif 800w, /art/wilds-1600.avif 1600w"
        sizes="(min-width: 1152px) 1100px, 100vw"
      />
      <img
        src="/art/wilds-1600.webp"
        srcset="/art/wilds-800.webp 800w, /art/wilds-1600.webp 1600w"
        sizes="(min-width: 1152px) 1100px, 100vw"
        alt=""
        width="1600"
        height="900"
        fetchpriority="high"
      />
    </picture>
    <div class="today-copy">
      <p class="eyebrow">
        {status?.server.name ?? data.siteName}{status?.save.day !== null &&
        status?.save.day !== undefined
          ? ` · ${t.today.day(status.save.day)}`
          : ''}
      </p>
      <h1 class="hero-title">{headline}</h1>
      {#if status?.server.world_name}
        <p class="max-w-2xl text-[0.875rem] text-ink-muted">{status.server.world_name}</p>
      {/if}
      <p class="note mt-4 text-gold">Every adventure leaves a story.</p>
      <a class="journal-link" href="/players"
        >Meet the adventurers <span aria-hidden="true">→</span></a
      >
    </div>
  </header>

  {#if fresh}
    <SetupSteps />
  {/if}

  <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
    <div class="flex flex-col gap-6">
      <div class="live-card">
        <Card title={t.today.onlineTitle} description={players.length === 0 ? t.today.nobody : ''}>
          {#snippet actions()}
            <Freshness source="log" at={online?.observed_at ?? status?.players.observed_at} />
          {/snippet}
          {#if !online && !data.online.ok}
            <ErrorNote error={data.online.error} what="who is online" />
          {:else if players.length === 0}
            <p class="note">
              {status?.state === 'online' ? t.today.emptyOnline : t.today.emptyOffline}
            </p>
          {:else}
            <ul class="flex flex-col divide-y divide-line">
              {#each players as player (player.id)}
                <li class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <p class="flex flex-wrap items-baseline gap-x-2">
                    <PlayerLink player={{ id: player.id, name: player.name }} />
                    <PlatformTag platform={player.platform} />
                    {#if player.down}<span class="chip text-danger">{t.today.fallen}</span>{/if}
                  </p>
                  <p class="text-[0.72rem] text-ink-muted">
                    {t.today.onSince}
                    <Time at={player.joined_at} mode="relative" />
                  </p>
                </li>
              {/each}
            </ul>
          {/if}
        </Card>
      </div>

      <Card title={t.today.lastSave}>
        {#snippet actions()}
          <Freshness source="save" at={status?.save.saved_at} />
        {/snippet}
        {#if status?.save.saved_at}
          <p class="text-[0.875rem]">
            {#if status.save.day !== null}<span class="stat-value"
                >{t.today.day(status.save.day)}</span
              >{/if}
            <span class="ml-2 text-ink-muted"><Time at={status.save.saved_at} /></span>
          </p>
        {:else}
          <p class="note">{t.today.noSave}</p>
        {/if}
      </Card>
    </div>

    <div class="flex flex-col gap-6">
      <div class="live-card">
        <Card title={t.today.latestTitle}>
          {#snippet actions()}
            <a href="/activity" class="btn">{t.today.everything}</a>
          {/snippet}
          {#if activity.length === 0}
            {#if !data.activity.ok}
              <ErrorNote error={data.activity.error} what="the activity feed" />
            {:else}
              <p class="note">{t.today.nothingYet}</p>
            {/if}
          {:else}
            <ActivityFeed items={activity} />
          {/if}
        </Card>
      </div>
    </div>
  </div>

  <Card title={t.today.lastDay}>
    {#snippet actions()}
      <a href="/world" class="btn">{t.today.serverHistory}</a>
    {/snippet}
    {#if data.history.ok}
      <PlayerCountChart history={data.history.data} maxPlayers={status?.players.max ?? null} />
    {:else}
      <ErrorNote error={data.history.error} what="the server history" />
    {/if}
  </Card>
</div>
