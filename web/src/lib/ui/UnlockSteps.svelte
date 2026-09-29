<script lang="ts">
  import type { CatalogUnlock } from '$lib/api/types';
  import { stepText } from './names';
  import { unlockState, type Person } from './planner';
  import { t } from './strings';

  let { unlock, person = null }: { unlock: CatalogUnlock; person?: Person | null } = $props();

  const state = $derived(person ? unlockState(unlock, person) : null);
</script>

{#if unlock.steps.length === 0}
  <span class="text-ink-muted">{t.journal.hints.unknown}</span>
{:else}
  <ul class="flex flex-col gap-0.5">
    {#each unlock.steps as step, index (index)}
      {@const met = state?.steps[index]?.met}
      <li class="flex flex-wrap items-baseline gap-x-2">
        {#if index > 0}<span class="stat-label"
            >{unlock.operator === 'or' ? t.journal.orElse : t.journal.also}</span
          >{/if}
        <span>{stepText(step)}</span>
        {#if met !== undefined}
          <span class="chip {met ? 'text-online' : ''}"
            >{met ? t.journal.done : t.journal.todo}</span
          >
        {/if}
      </li>
    {/each}
  </ul>
{/if}
