<script lang="ts">
  import { onDestroy } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { ApiError, api } from '$lib/api/client';
  import type { Job } from '$lib/api/types';
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatBytes, formatDuration, formatMegabytes, formatNumber } from '$lib/ui/format';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import { t } from '$lib/ui/strings';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  let job = $state<Job | null>(null);
  let message = $state('');
  let busy = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const health = $derived(data.health.ok ? data.health.data : null);
  const collector = $derived(health?.collector ?? null);
  const stateTone = $derived(
    collector?.state === 'active'
      ? 'text-online'
      : collector?.state === 'lost'
        ? 'text-danger'
        : 'text-warning'
  );
  const layerTone = (value: string | null) =>
    value === 'ok'
      ? 'text-online'
      : value === 'off' || value === null
        ? 'text-ink-muted'
        : 'text-warning';

  async function poll(id: number) {
    try {
      job = await api.getJob(id);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      return;
    }
    if (job.state === 'queued' || job.state === 'running') {
      timer = setTimeout(() => poll(id), 2000);
    } else {
      await invalidateAll();
    }
  }

  async function run(kind: 'projections_rebuild' | 'backup') {
    busy = true;
    message = '';
    try {
      const accepted = kind === 'backup' ? await api.runBackup() : await api.rebuildProjections();
      job = {
        id: accepted.job_id,
        kind,
        state: 'queued',
        progress: null,
        started_at: null,
        finished_at: null,
        error: null
      };
      await poll(accepted.job_id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        message = t.admin.health.alreadyRunning;
      } else {
        message = error instanceof Error ? error.message : String(error);
      }
    } finally {
      busy = false;
    }
  }

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

<Meta title={t.admin.health.title} description={t.admin.health.description} />

<div class="flex flex-col gap-6">
  <PageHeader eyebrow={t.admin.rail}>
    {#snippet heading()}{t.admin.health.title}{/snippet}
  </PageHeader>

  {#if !health || !collector}
    {#if !data.health.ok}<ErrorNote error={data.health.error} what="the health report" />{/if}
  {:else}
    <Card title={t.admin.health.collector}>
      {#snippet actions()}
        <a href="/admin/collector" class="btn">{t.admin.health.connection}</a>
      {/snippet}
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label={t.admin.health.state}>
          <span class={stateTone}>{t.admin.health.states[collector.state]}</span>
        </Stat>
        <Stat label={t.admin.health.heartbeat}>
          {#if collector.heartbeat_age_s === null}{t.admin.health.never}{:else}{formatDuration(
              collector.heartbeat_age_s
            )}
            {t.admin.health.agoSuffix}{/if}
        </Stat>
        <Stat label={t.admin.health.logs}
          ><span class={layerTone(collector.logs)}>{collector.logs ?? '—'}</span></Stat
        >
        <Stat label={t.admin.health.saves}
          ><span class={layerTone(collector.saves)}>{collector.saves ?? '—'}</span></Stat
        >
        <Stat label={t.admin.health.process}
          ><span class={layerTone(collector.process)}>{collector.process ?? '—'}</span></Stat
        >
        <Stat label={t.admin.health.mod}
          ><span class={layerTone(collector.mod)}>{collector.mod ?? '—'}</span></Stat
        >
        <Stat
          label={t.admin.health.queued}
          value="{collector.queue_depth === null
            ? '—'
            : formatNumber(collector.queue_depth)}, {collector.dropped_events === null
            ? '—'
            : formatNumber(collector.dropped_events)}"
        />
      </div>
      {#if collector.run}
        <p class="mt-4 text-[0.875rem] text-ink-muted">
          {t.admin.health.runLine(
            '',
            collector.run.version ?? t.admin.health.unknown,
            collector.run.os ?? '?',
            collector.run.arch ?? '?',
            collector.run.server_version ?? t.admin.health.unknown
          )}
          <Time at={collector.run.started_at} />
        </p>
        {#if collector.run.version && data.version && collector.run.version !== data.version}
          <p class="mt-2 text-[0.875rem] text-warning">
            {t.admin.health.versionMismatch(collector.run.version, data.version)}
          </p>
        {/if}
      {/if}
    </Card>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card title={t.admin.health.ingest}>
        <div class="grid grid-cols-2 gap-4">
          <Stat label={t.admin.health.batches} value={formatNumber(health.ingest.batches_24h)} />
          <Stat label={t.admin.health.events} value={formatNumber(health.ingest.events_24h)} />
          <Stat
            label={t.admin.health.duplicates}
            value={formatNumber(health.ingest.duplicates_24h)}
          />
          <Stat label={t.admin.health.flagged}>
            <span class={health.ingest.invalid_24h > 0 ? 'text-warning' : ''}
              >{formatNumber(health.ingest.invalid_24h)}</span
            >
          </Stat>
          <Stat label={t.admin.health.rejected}>
            <span class={health.ingest.rejected_24h > 0 ? 'text-danger' : ''}
              >{formatNumber(health.ingest.rejected_24h)}</span
            >
          </Stat>
          <Stat label={t.admin.health.lastBatch}
            ><Time
              at={health.ingest.last_batch_at}
              mode="relative"
              fallback={t.admin.health.never}
            /></Stat
          >
        </div>
      </Card>
      <Card title={t.admin.health.database}>
        <div class="grid grid-cols-2 gap-4">
          <Stat label={t.admin.health.events} value={formatNumber(health.db.events_total)} />
          <Stat label={t.admin.health.size} value={formatMegabytes(health.db.size_mb)} />
        </div>
      </Card>
      <Card title={t.admin.health.backups}>
        <div class="grid grid-cols-2 gap-4">
          <Stat label={t.admin.health.lastBackup}
            ><Time
              at={health.backup.last_at}
              mode="relative"
              fallback={t.admin.health.never}
            /></Stat
          >
          <Stat
            label={t.admin.health.size}
            value={health.backup.size_mb === null ? '—' : formatMegabytes(health.backup.size_mb)}
          />
          <Stat
            label={t.admin.health.kept}
            value={formatNumber(health.backup.kept)}
            detail={t.admin.health.nightly}
          />
        </div>
      </Card>
    </div>

    <Card title={t.admin.health.jobs} flush>
      {#if health.jobs.length === 0}
        <EmptyState message={t.admin.health.noJobs} />
      {:else}
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead
              ><tr
                ><th>{t.admin.health.job}</th><th>{t.admin.health.lastRun}</th><th
                  >{t.admin.health.result}</th
                ></tr
              ></thead
            >
            <tbody>
              {#each health.jobs as entry (entry.name)}
                <tr>
                  <td data-label={t.admin.health.job}><code class="text-xs">{entry.name}</code></td>
                  <td data-label={t.admin.health.lastRun}
                    ><Time
                      at={entry.last_run_at}
                      mode="relative"
                      fallback={t.admin.health.never}
                    /></td
                  >
                  <td data-label={t.admin.health.result}>
                    {#if entry.last_ok === null}
                      <span class="text-ink-muted">{t.admin.health.notRun}</span>
                    {:else if entry.last_ok}
                      <span class="text-online">{t.admin.health.ok}</span>
                    {:else}
                      <span class="text-danger"
                        >{t.admin.health.failed(entry.last_error ?? t.errors.unknownError)}</span
                      >
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </Card>
  {/if}

  <Card title={t.admin.health.maintenance}>
    <div class="flex flex-wrap items-center gap-3 text-[0.875rem]">
      <button type="button" class="btn" disabled={busy} onclick={() => run('projections_rebuild')}
        >{t.admin.health.rebuild}</button
      >
      <button type="button" class="btn" disabled={busy} onclick={() => run('backup')}
        >{t.admin.health.backupNow}</button
      >
      {#if job}
        <span role="status">
          {t.admin.health.jobLine(
            job.id,
            job.kind === 'backup' ? t.admin.health.kinds.backup : t.admin.health.kinds.rebuild
          )}
          <span
            class={job.state === 'failed'
              ? 'text-danger'
              : job.state === 'done'
                ? 'text-online'
                : 'text-warning'}>{job.state}</span
          >
          {#if job.progress !== null && job.state === 'running'}{Math.round(
              job.progress * 100
            )}%{/if}
          {#if job.error}<span class="text-danger">{job.error}</span>{/if}
        </span>
      {/if}
      {#if message}<span class="text-danger" role="alert">{message}</span>{/if}
    </div>
    <p class="mt-4 text-[0.78rem] leading-relaxed text-ink-muted">{t.admin.health.rebuildNote}</p>
  </Card>

  <Card title={t.admin.health.backupFiles} flush>
    {#if !data.backups.ok}
      <div class="p-4"><ErrorNote error={data.backups.error} what="the backup list" /></div>
    {:else if data.backups.data.items.length === 0}
      <EmptyState message={t.admin.health.noBackups} />
    {:else}
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead
            ><tr
              ><th>{t.admin.health.taken}</th><th>{t.admin.health.file}</th><th class="num"
                >{t.admin.health.size}</th
              ><th>{t.admin.health.result}</th></tr
            ></thead
          >
          <tbody>
            {#each data.backups.data.items as backup (backup.file)}
              <tr>
                <td data-label={t.admin.health.taken}><Time at={backup.at} /></td>
                <td data-label={t.admin.health.file}><code class="text-xs">{backup.file}</code></td>
                <td class="num" data-label={t.admin.health.size}
                  >{formatBytes(backup.size_bytes)}</td
                >
                <td
                  class={backup.ok ? 'text-online' : 'text-danger'}
                  data-label={t.admin.health.result}>{backup.ok ? t.admin.health.ok : 'failed'}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Card>
</div>
