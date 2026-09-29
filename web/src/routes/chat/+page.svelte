<script lang="ts">
  import type { ChatItem } from '$lib/api/types';
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { useLive } from '$lib/ui/live.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Pager from '$lib/ui/Pager.svelte';
  import PlayerLink from '$lib/ui/PlayerLink.svelte';
  import { t } from '$lib/ui/strings';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  const live = useLive();
  const loaded = $derived(data.chat.ok ? data.chat.data.items : []);
  const liveLines = $derived(
    live.activity
      .filter((item) => item.type === 'chat.message')
      .map((item): ChatItem => ({
        id: item.id,
        ts: item.ts,
        player: item.player,
        name: item.player?.name ?? t.activity.someone,
        channel: item.details.channel ?? 'other',
        text: item.details.text ?? ''
      }))
  );
  const lines = $derived.by(() => {
    if (data.paged) return loaded;
    const all = [...liveLines, ...loaded];
    return all
      .filter((line, index) => all.findIndex((other) => other.id === line.id) === index)
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  });
</script>

<Meta title={t.chat.title} description={t.chat.description} />

<div class="flex flex-col gap-6">
  <PageHeader eyebrow={t.chat.eyebrow} note={t.chat.note}>
    {#snippet heading()}{t.chat.title}{/snippet}
  </PageHeader>

  <Card>
    {#if !data.chat.ok}
      <ErrorNote error={data.chat.error} what="the chat" />
    {:else if lines.length === 0}
      <EmptyState message={t.chat.empty} />
    {:else}
      <ul class="flex flex-col divide-y divide-line" aria-live="polite" aria-relevant="additions">
        {#each lines as line (line.id)}
          <li class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-[0.875rem]">
            <span class="w-24 shrink-0 text-[0.72rem] text-ink-muted"
              ><Time at={line.ts} mode="relative" /></span
            >
            <span class="chip text-ink-muted">{t.activity.channels[line.channel]}</span>
            {#if line.player}<PlayerLink player={line.player} />{:else}<span>{line.name}</span>{/if}
            <span class="note min-w-[10rem] flex-1 text-[1.05rem] [overflow-wrap:anywhere] text-ink"
              >{line.text}</span
            >
          </li>
        {/each}
      </ul>
      <Pager nextCursor={data.chat.data.next_cursor} count={lines.length} label={t.chat.lines} />
    {/if}
  </Card>
</div>
