<script lang="ts">
  import type { Status } from '$lib/api/types';
  import Freshness from './Freshness.svelte';
  import type { LiveStreamState } from './live.svelte';
  import type { LoadFailure } from './load';
  import { t } from './strings';
  import Time from './Time.svelte';

  let {
    status,
    error,
    stream
  }: { status: Status | null; error: LoadFailure | null; stream: LiveStreamState } = $props();

  const stateLabel = $derived(
    status?.state === 'online'
      ? status.stopping
        ? t.status.stopping
        : t.status.online
      : status?.state === 'offline'
        ? t.status.offline
        : t.status.unknown
  );
  const lampClass = $derived(
    status?.state === 'online'
      ? 'text-online'
      : status?.state === 'offline'
        ? 'text-offline'
        : 'text-warning'
  );
  const collectorNote = $derived(
    status?.collector.state === 'lost'
      ? t.status.collectorLost
      : status?.collector.state === 'stopped'
        ? t.status.collectorStopped
        : status?.collector.state === 'none'
          ? t.status.collectorNone
          : null
  );
  const remote = $derived(status?.collector.remote);
  const streamLabel = $derived(remote && stream === 'open' ? 'Polled' : t.status.stream[stream]);
</script>

<div class="status-strip ticker" role="status" aria-live="polite">
  <div
    class="mx-auto flex min-h-(--strip-height) w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-(--gutter) py-1.5"
  >
    {#if status}
      <a href="/" class="flex min-h-6 items-center gap-2 text-ink hover:text-accent-bright">
        <span class="lamp {lampClass}" aria-hidden="true"></span>
        {stateLabel}
      </a>
      {#if status.state === 'online'}
        <span class="flex flex-wrap items-center gap-x-2">
          {t.status.players(status.players.online, status.players.max)}
          <span class="hidden tracking-normal normal-case sm:inline"
            ><Freshness source="log" at={status.players.observed_at} /></span
          >
        </span>
      {/if}
      {#if collectorNote}
        <span class="text-warning">
          {collectorNote}
          {#if status.collector.last_seen_at && status.collector.state === 'lost'}
            <span
              >, {t.status.lastHeard}
              <Time at={status.collector.last_seen_at} mode="relative" /></span
            >
          {/if}
        </span>
      {:else if status.since && status.state === 'online'}
        <span class="hidden sm:inline"
          >{t.status.upSince} <Time at={status.since} mode="relative" /></span
        >
      {/if}
    {:else}
      <span class="text-warning">{t.status.unavailable}{error ? ` (${error.code})` : ''}</span>
    {/if}
    <span
      class="ml-auto flex items-center gap-2"
      title={remote
        ? 'Remote files are checked periodically. Observation times can be earlier than the last check.'
        : t.status.streamTitle}
    >
      <span
        class="inline-block size-1.5 rounded-full {stream === 'open'
          ? 'live-dot bg-online shadow-[0_0_8px_var(--color-online)]'
          : stream === 'off'
            ? 'bg-line-strong'
            : 'bg-warning'}"
        aria-hidden="true"
      ></span>
      {streamLabel}
    </span>
  </div>
</div>
