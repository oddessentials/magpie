<script lang="ts">
  import { page } from '$app/state';
  import { formatNumber } from '$lib/ui/format';
  import { useLive } from '$lib/ui/live.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PlatformTag from '$lib/ui/PlatformTag.svelte';
  import { t } from '$lib/ui/strings';
  import SunDial from '$lib/ui/SunDial.svelte';

  let { data } = $props();

  const live = useLive();
  const status = $derived(live.status ?? data.status);
  const online = $derived(live.online ?? (data.online.ok ? data.online.data : null));
  const players = $derived(online?.players ?? []);
  const params = $derived(page.url.searchParams);
  const shown = $derived(new Set((params.get('show') ?? 'clock,players').split(',')));
  const size = $derived(Math.min(480, Math.max(120, Number(params.get('size')) || 240)));
  const limit = $derived(Math.min(32, Math.max(1, Number(params.get('limit')) || 10)));
  const row = $derived(params.get('layout') === 'row');
  const solid = $derived(params.has('solid'));
  const headline = $derived(
    players.length === 0
      ? t.today.headline.empty
      : players.length === 1
        ? t.today.headline.one
        : t.today.headline.many(formatNumber(players.length))
  );
</script>

<Meta title={t.watch.title} description={t.watch.description} />

<svelte:head>
  <meta name="robots" content="noindex" />
</svelte:head>

<main
  class="watch"
  data-row={row ? 'true' : undefined}
  data-solid={solid ? 'true' : undefined}
  style="--watch-dial: {size}px"
>
  <h1 class="sr-only">{t.watch.title}</h1>
  {#if shown.has('clock')}
    <div class="watch-dial" data-compact={size < 250 ? 'true' : undefined}>
      <SunDial {status} />
    </div>
  {/if}
  {#if shown.has('players')}
    <section class="watch-card" aria-label={t.watch.players}>
      <p class="watch-headline">{headline}</p>
      {#if players.length > 0}
        <ul class="watch-players">
          {#each players.slice(0, limit) as player (player.id)}
            <li>
              <span class="watch-name">{player.name}</span>
              <PlatformTag platform={player.platform} />
            </li>
          {/each}
        </ul>
        {#if players.length > limit}
          <p class="watch-more">{t.watch.more(formatNumber(players.length - limit))}</p>
        {/if}
      {/if}
    </section>
  {/if}
</main>
