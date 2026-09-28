<script lang="ts">
  import { page } from '$app/state';
  import { withParams } from './query';
  import { t } from './strings';

  let {
    nextCursor,
    count,
    label = 'items'
  }: { nextCursor: string | null; count: number; label?: string } = $props();

  const hasCursor = $derived(page.url.searchParams.has('cursor'));
  const newestHref = $derived(withParams(page.url, { cursor: null }));
  const olderHref = $derived(nextCursor ? withParams(page.url, { cursor: nextCursor }) : null);
</script>

{#if hasCursor || olderHref}
  <nav class="flex flex-wrap items-center gap-3 px-1 pt-3" aria-label={t.pager.label}>
    {#if hasCursor}
      <a href={newestHref} class="btn">{t.pager.newest}</a>
    {/if}
    {#if olderHref}
      <a href={olderHref} class="btn">{t.pager.older}</a>
    {/if}
    <span class="ticker">{t.pager.onThisPage(count, label)}</span>
  </nav>
{/if}
