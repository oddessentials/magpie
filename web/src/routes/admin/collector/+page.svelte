<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { ApiError, api } from '$lib/api/client';
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatNumber } from '$lib/ui/format';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import { t } from '$lib/ui/strings';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  let revealed = $state(false);
  let secret = $state<string | null>(null);
  let busy = $state(false);
  let message = $state('');
  let copied = $state(false);

  const collector = $derived(data.collector.ok ? data.collector.data : null);
  const shown = $derived(secret ?? collector?.secret ?? '');
  const masked = $derived(shown ? `${shown.slice(0, 4)}${'•'.repeat(24)}` : '');
  const config = $derived(
    [
      '[site]',
      `url = "${data.origin}"`,
      `secret = "${revealed ? shown : t.admin.collector.secretPlaceholder}"`,
      '',
      '[server]',
      'source = "launch"',
      'directory = "<the dedicated server install>"'
    ].join('\n')
  );

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      message = t.admin.collector.copyFailed;
    }
  }

  async function regenerate() {
    busy = true;
    message = '';
    try {
      secret = (await api.regenerateCollectorSecret()).secret;
      revealed = true;
      message = t.admin.collector.replaced;
      await invalidateAll();
    } catch (error) {
      message =
        error instanceof ApiError && error.status === 409
          ? t.admin.collector.cannotReplace
          : error instanceof Error
            ? error.message
            : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<Meta title={t.admin.collector.title} description={t.admin.collector.description} />

<div class="flex flex-col gap-6">
  <PageHeader eyebrow={t.admin.rail} note={t.admin.collector.note}>
    {#snippet heading()}{t.admin.collector.title}{/snippet}
  </PageHeader>

  {#if !collector}
    {#if !data.collector.ok}<ErrorNote error={data.collector.error} what="the collector" />{/if}
  {:else}
    <Card title={t.admin.collector.secret}>
      <div class="flex flex-col gap-3 text-[0.875rem]">
        <div class="flex flex-wrap items-center gap-2">
          <code class="rounded bg-surface-sunken px-2 py-1 text-xs break-all"
            >{revealed ? shown : masked}</code
          >
          <button type="button" class="btn" onclick={() => (revealed = !revealed)}
            >{revealed ? t.admin.collector.hide : t.admin.collector.show}</button
          >
          <button type="button" class="btn" onclick={() => copy(shown)}
            >{copied ? t.admin.collector.copied : t.admin.collector.copy}</button
          >
          {#if !collector.secret_from_environment}
            <button type="button" class="btn btn-danger" disabled={busy} onclick={regenerate}
              >{t.admin.collector.replace}</button
            >
          {/if}
        </div>
        {#if collector.secret_from_environment}
          <p class="note">{t.admin.collector.fromEnvironment}</p>
        {/if}
        {#if message}<p role="status">{message}</p>{/if}
      </div>
    </Card>

    <Card title={t.admin.collector.settingsTitle}>
      <p class="mb-3 text-[0.875rem] text-ink-muted">{t.admin.collector.settingsNote}</p>
      <pre
        class="overflow-x-auto rounded-(--radius-card) bg-surface-sunken p-4 text-xs leading-relaxed">{config}</pre>
      <p class="mt-3 text-[0.78rem] text-ink-muted">
        {t.admin.collector.siteVersion(collector.site_version)}
      </p>
    </Card>

    <Card title={t.admin.collector.ingest}>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t.admin.health.batches} value={formatNumber(collector.ingest.batches_24h)} />
        <Stat label={t.admin.health.events} value={formatNumber(collector.ingest.events_24h)} />
        <Stat
          label={t.admin.health.duplicates}
          value={formatNumber(collector.ingest.duplicates_24h)}
        />
        <Stat label={t.admin.health.flagged} value={formatNumber(collector.ingest.invalid_24h)} />
        <Stat label={t.admin.health.rejected} value={formatNumber(collector.ingest.rejected_24h)} />
        <Stat label={t.admin.health.lastBatch}
          ><Time
            at={collector.ingest.last_batch_at}
            mode="relative"
            fallback={t.admin.health.never}
          /></Stat
        >
      </div>
    </Card>

    <Card title={t.admin.collector.runs} flush>
      {#if collector.runs.length === 0}
        <EmptyState message={t.admin.collector.noRuns} />
      {:else}
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>{t.admin.collector.columns.started}</th>
                <th>{t.admin.collector.columns.version}</th>
                <th>{t.admin.collector.columns.platform}</th>
                <th>{t.admin.collector.columns.server}</th>
                <th>{t.admin.collector.columns.lastSeen}</th>
                <th>{t.admin.collector.columns.state}</th>
              </tr>
            </thead>
            <tbody>
              {#each collector.runs as run (run.run_id)}
                <tr>
                  <td data-label={t.admin.collector.columns.started}
                    ><Time at={run.started_at} /></td
                  >
                  <td data-label={t.admin.collector.columns.version}>{run.version ?? '—'}</td>
                  <td data-label={t.admin.collector.columns.platform}
                    >{run.os ?? '?'}/{run.arch ?? '?'}</td
                  >
                  <td data-label={t.admin.collector.columns.server}>{run.server_version ?? '—'}</td>
                  <td data-label={t.admin.collector.columns.lastSeen}
                    ><Time at={run.last_seen_at} mode="relative" /></td
                  >
                  <td data-label={t.admin.collector.columns.state}>
                    {#if run.stopped_at}<span class="text-ink-muted"
                        >{t.admin.collector.stopped}</span
                      >{:else if run.lost_at}<span class="text-danger"
                        >{t.admin.collector.lost}</span
                      >{:else}<span class="text-online">{t.admin.collector.running}</span>{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </Card>
  {/if}
</div>
