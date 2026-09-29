<script lang="ts">
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import WorldMap from '$lib/ui/WorldMap.svelte';

  let { data } = $props();
</script>

<Meta
  title="World map"
  description="Explore the wilds: regions, landmarks, resources, creatures, lore and quests from the game build, with discoveries from the last save."
/>
<div class="flex flex-col gap-6">
  <PageHeader
    eyebrow="An atlas of the wilds"
    note="Choose a region, turn on the layers you need, or find where an item, a creature or a lore book lies."
  >
    {#snippet heading()}World map{/snippet}
    {#snippet aside()}<a class="btn" href="/world">World journal ↗</a>{/snippet}
  </PageHeader>
  {#if data.map.ok}
    <WorldMap
      world={data.map.data}
      save={data.world.ok ? data.world.data.save : null}
      live={data.live}
      findLabel={data.findLabel}
    />
  {:else}
    <ErrorNote error={data.map.error} what="the map" />
  {/if}
</div>
