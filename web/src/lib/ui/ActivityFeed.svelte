<script lang="ts">
  import type { ActivityItem } from '$lib/api/types';
  import ActivityLine from './ActivityLine.svelte';
  import { t } from './strings';

  let { items, compact = false }: { items: ActivityItem[]; compact?: boolean } = $props();
</script>

<ul
  class="spine flex flex-col"
  aria-live="polite"
  aria-relevant="additions"
  aria-label={t.activity.feedLabel}
>
  {#each items as item (item.id)}
    <ActivityLine {item} {compact} />
  {/each}
</ul>
