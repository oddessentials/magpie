<script lang="ts">
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import WorldMap from '$lib/ui/WorldMap.svelte';

  let { data } = $props();
</script>

<Meta
  title="World map"
  description="Explore the wilds: regions, fixed lodestones and known boss locations, with discoveries from the last save."
/>
<div class="flex flex-col gap-6">
  <PageHeader
    eyebrow="An atlas of the wilds"
    note="Choose a region. Follow its boundaries. Find your next destination."
  >
    {#snippet heading()}World map{/snippet}
    {#snippet aside()}<a class="btn" href="/world">World journal ↗</a>{/snippet}
  </PageHeader>
  {#if data.map.ok}
    <WorldMap world={data.map.data} save={data.world.ok ? data.world.data.save : null} />
  {:else}
    <ErrorNote error={data.map.error} what="the map" />
  {/if}
</div>
