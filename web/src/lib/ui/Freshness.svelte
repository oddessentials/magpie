<script lang="ts">
  import { browser } from '$app/environment';
  import { clock } from './clock.svelte';
  import { ageText, formatUtc } from './format';
  import { t } from './strings';

  let {
    source,
    at
  }: { source: 'log' | 'save' | 'process' | 'collector'; at: string | null | undefined } = $props();

  const now = $derived(browser ? clock.now : Date.now());
</script>

<span class="freshness">
  {#if at}
    {t.freshness[source]}, <time datetime={at} title={formatUtc(at)}>{ageText(at, now)}</time>
  {:else}
    {t.freshness.unknown}
  {/if}
</span>
