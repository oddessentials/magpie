<script lang="ts">
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Pager from '$lib/ui/Pager.svelte';
  import { t } from '$lib/ui/strings';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  let open = $state<string | null>(null);
  const items = $derived(data.events.ok ? data.events.data.items : []);
</script>

<Meta title={t.admin.events.title} description={t.admin.events.description} />

<div class="flex flex-col gap-6">
  <PageHeader eyebrow={t.admin.rail} note={t.admin.events.note}>
    {#snippet heading()}{t.admin.events.title}{/snippet}
    {#snippet aside()}
      <form method="get" class="flex flex-wrap items-center gap-2 text-[0.875rem]">
        <input
          type="text"
          name="type"
          value={data.type}
          placeholder={t.admin.events.typePlaceholder}
          class="field w-44"
        />
        <label class="label flex items-center gap-2 whitespace-nowrap text-ink">
          <input type="checkbox" name="invalid" value="true" checked={data.invalid} />
          {t.admin.events.flaggedOnly}
        </label>
        <button type="submit" class="btn">{t.admin.events.filter}</button>
      </form>
    {/snippet}
  </PageHeader>

  <Card flush>
    {#if !data.events.ok}
      <div class="p-4"><ErrorNote error={data.events.error} what="the events" /></div>
    {:else if items.length === 0}
      <EmptyState message={t.admin.events.empty} />
    {:else}
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr
              ><th>{t.admin.events.columns.time}</th><th>{t.admin.events.columns.type}</th><th
                >{t.admin.events.columns.player}</th
              ><th>{t.admin.events.columns.from}</th><th>{t.admin.events.columns.notes}</th></tr
            >
          </thead>
          <tbody>
            {#each items as item (item.id)}
              <tr>
                <td class="whitespace-nowrap" data-label={t.admin.events.columns.time}
                  ><Time at={item.ts} /></td
                >
                <td data-label={t.admin.events.columns.type}>
                  <button
                    type="button"
                    class="text-left font-semibold text-accent hover:underline"
                    aria-expanded={open === item.id}
                    onclick={() => (open = open === item.id ? null : item.id)}>{item.type}</button
                  >
                  {#if open === item.id}
                    <pre
                      class="mt-2 max-w-xl overflow-x-auto rounded bg-surface-sunken p-3 text-[0.72rem] leading-relaxed">{JSON.stringify(
                        item.data,
                        null,
                        2
                      )}</pre>
                    <p class="mt-1 text-[0.72rem] text-ink-muted">
                      {t.admin.events.runLine(item.run_id.slice(0, 8), item.seq)}
                      <Time at={item.received_at} />
                    </p>
                  {/if}
                </td>
                <td data-label={t.admin.events.columns.player}>{item.player?.name ?? ''}</td>
                <td class="text-ink-muted" data-label={t.admin.events.columns.from}
                  >{item.source}</td
                >
                <td data-label={t.admin.events.columns.notes}>
                  {#if item.invalid}<span class="text-warning"
                      >{t.admin.events.flagged(item.invalid)}</span
                    >{:else if item.quiet}<span class="text-ink-muted">{t.admin.events.quiet}</span
                    >{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="px-3 pb-3">
        <Pager
          nextCursor={data.events.data.next_cursor}
          count={items.length}
          label={t.admin.events.unit}
        />
      </div>
    {/if}
  </Card>
</div>
