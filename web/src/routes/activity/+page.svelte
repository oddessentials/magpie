<script lang="ts">
  import { page } from '$app/state';
  import { activityFilters, mergeActivity } from '$lib/ui/activity';
  import ActivityFeed from '$lib/ui/ActivityFeed.svelte';
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { useLive } from '$lib/ui/live.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Pager from '$lib/ui/Pager.svelte';
  import { withParams } from '$lib/ui/query';
  import { t } from '$lib/ui/strings';

  let { data } = $props();

  const live = useLive();
  const wanted = $derived(new Set(data.types ? data.types.split(',') : []));
  const loaded = $derived(data.activity.ok ? data.activity.data.items : []);
  const items = $derived(
    data.paged
      ? loaded
      : mergeActivity(
          live.activity.filter((item) => wanted.size === 0 || wanted.has(item.type)),
          loaded
        )
  );
</script>

<Meta title={t.activity.title} description={t.activity.description} />

<div class="flex flex-col gap-6">
  <PageHeader eyebrow={t.activity.eyebrow} note={t.activity.note}>
    {#snippet heading()}{t.activity.title}{/snippet}
  </PageHeader>

  <nav class="flex flex-wrap gap-1.5" aria-label={t.activity.filterLabel}>
    <a
      href={withParams(page.url, { types: null, cursor: null })}
      class="seg"
      aria-current={wanted.size === 0 ? 'true' : undefined}>{t.activity.everything}</a
    >
    {#each activityFilters as filter (filter.label)}
      <a
        href={withParams(page.url, { types: filter.types.join(','), cursor: null })}
        class="seg"
        aria-current={data.types === filter.types.join(',') ? 'true' : undefined}>{filter.label}</a
      >
    {/each}
  </nav>

  <Card>
    {#if !data.activity.ok}
      <ErrorNote error={data.activity.error} what="the activity" />
    {:else if items.length === 0}
      <EmptyState message={t.activity.empty} />
    {:else}
      <ActivityFeed {items} />
      <Pager
        nextCursor={data.activity.data.next_cursor}
        count={items.length}
        label={t.activity.lines}
      />
    {/if}
  </Card>
</div>
