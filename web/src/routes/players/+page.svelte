<script lang="ts">
  import { page } from '$app/state';
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatHours, formatNumber } from '$lib/ui/format';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Pager from '$lib/ui/Pager.svelte';
  import PlatformTag from '$lib/ui/PlatformTag.svelte';
  import PlayerLink from '$lib/ui/PlayerLink.svelte';
  import { withParams } from '$lib/ui/query';
  import { t } from '$lib/ui/strings';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  const sorts = (['last_seen', 'playtime', 'deaths', 'name'] as const).map((key) => ({
    key,
    label: t.players.sorts[key]
  }));

  const items = $derived(data.players.ok ? data.players.data.items : []);
</script>

<Meta title={t.players.title} description={t.players.description} />

<div class="flex flex-col gap-6">
  <PageHeader eyebrow={t.players.eyebrow} note={t.players.note}>
    {#snippet heading()}{t.players.title}{/snippet}
    {#snippet aside()}
      <form method="get" class="flex flex-wrap items-center gap-2 text-[0.875rem]">
        <input type="hidden" name="sort" value={data.sort} />
        <label>
          <span class="sr-only">{t.players.searchLabel}</span>
          <input
            type="search"
            name="q"
            value={data.q}
            placeholder={t.players.searchPlaceholder}
            class="field w-48"
          />
        </label>
        <button type="submit" class="btn">{t.players.search}</button>
        {#if data.q}<a href={withParams(page.url, { q: null, cursor: null })} class="seg"
            >{t.players.clear}</a
          >{/if}
      </form>
    {/snippet}
  </PageHeader>

  <nav class="flex flex-wrap gap-1.5" aria-label={t.players.sortLabel}>
    {#each sorts as sort (sort.key)}
      <a
        href={withParams(page.url, { sort: sort.key, cursor: null })}
        class="seg"
        aria-current={data.sort === sort.key ? 'true' : undefined}>{sort.label}</a
      >
    {/each}
  </nav>

  <Card flush>
    {#if !data.players.ok}
      <div class="p-4"><ErrorNote error={data.players.error} what="the player list" /></div>
    {:else if items.length === 0}
      <EmptyState message={data.q ? t.players.noMatch : t.players.empty} />
    {:else}
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>{t.players.columns.player}</th>
              <th class="num">{t.players.columns.playtime}</th>
              <th class="num">{t.players.columns.sessions}</th>
              <th class="num">{t.players.columns.deaths}</th>
              <th>{t.players.columns.firstSeen}</th>
              <th>{t.players.columns.lastSeen}</th>
            </tr>
          </thead>
          <tbody>
            {#each items as player (player.id)}
              <tr>
                <td data-label={t.players.columns.player}>
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      class="lamp {player.online ? 'text-online' : 'text-line-strong'}"
                      title={player.online ? t.players.onlineTitle : t.players.offlineTitle}
                      aria-hidden="true"
                    ></span>
                    <PlayerLink player={{ id: player.id, name: player.name }} />
                    <PlatformTag platform={player.platform} />
                  </div>
                </td>
                <td class="num" data-label={t.players.columns.playtime}
                  >{formatHours(player.playtime_s)}</td
                >
                <td class="num" data-label={t.players.columns.sessions}
                  >{formatNumber(player.sessions)}</td
                >
                <td class="num" data-label={t.players.columns.deaths}
                  >{formatNumber(player.deaths)}</td
                >
                <td data-label={t.players.columns.firstSeen}
                  ><Time at={player.first_seen} mode="date" /></td
                >
                <td data-label={t.players.columns.lastSeen}>
                  {#if player.online}<span class="text-online">{t.players.onlineNow}</span
                    >{:else}<Time at={player.last_seen} mode="relative" />{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="px-3 pb-3">
        <Pager
          nextCursor={data.players.data.next_cursor}
          count={items.length}
          label={t.players.unit}
        />
      </div>
    {/if}
  </Card>
</div>
