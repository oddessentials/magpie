<script lang="ts">
  import type { ActivityItem } from '$lib/api/types';
  import { activityLabels, describeActivity, type ActivityTone } from './activity';
  import PlayerLink from './PlayerLink.svelte';
  import { journalCategory } from './strings';
  import Time from './Time.svelte';

  let {
    item,
    timeMode = 'relative',
    compact = false
  }: {
    item: ActivityItem;
    timeMode?: 'relative' | 'absolute';
    compact?: boolean;
  } = $props();

  const view = $derived(describeActivity(item));
  const category = $derived(
    item.type === 'journal.unlocked' ? journalCategory(item.details.entry ?? '') : null
  );
  const toneClass: Record<ActivityTone, string> = {
    neutral: 'bg-line-strong',
    good: 'bg-online',
    bad: 'bg-offline',
    warn: 'bg-warning',
    info: 'bg-heather'
  };
</script>

<li class="flex gap-3.5 {compact ? 'py-1.5' : 'py-2.5'} text-[0.875rem]" data-type={item.type}>
  <span class="diamond mt-2 {toneClass[view.tone]}" aria-hidden="true"></span>
  <div class="min-w-0 flex-1">
    <p class="leading-snug">
      {#each view.parts as part, index (index)}
        {#if part.kind === 'text'}{part.text}{:else if part.kind === 'player'}<PlayerLink
            player={part.player}
          />{:else}<q class="note text-[1.05rem] text-ink">{part.text}</q>{/if}
      {/each}
    </p>
    <p class="mt-0.5 flex flex-wrap gap-x-3 text-[0.72rem] text-ink-muted">
      {#if !compact}<span class="label whitespace-nowrap">{activityLabels[item.type]}</span>{/if}
      {#if view.channel}<span>{view.channel}</span>{/if}
      {#if category}<span>{category}</span>{/if}
      <Time at={item.ts} mode={timeMode} />
    </p>
  </div>
</li>
