<script lang="ts">
  import { browser } from '$app/environment';
  import type { PlayerCharacter } from '$lib/api/types';
  import { clock } from './clock.svelte';
  import { formatDateTime, parseInstant } from './format';
  import { t } from './strings';

  let { history }: { history: PlayerCharacter['level_history'] } = $props();

  let width = $state(560);
  const height = 140;
  const padLeft = 34;
  const padRight = 10;
  const padTop = 10;
  const padBottom = 22;

  const points = $derived(
    history
      .map((point) => ({ ...point, ms: parseInstant(point.saved_at) ?? 0 }))
      .filter((point) => point.ms > 0)
      .sort((a, b) => a.ms - b.ms)
  );
  const first = $derived(points[0]?.ms ?? 0);
  const last = $derived(points.at(-1)?.ms ?? 1);
  const span = $derived(Math.max(1, last - first));
  const low = $derived(Math.max(0, Math.min(...points.map((point) => point.total_level)) - 1));
  const high = $derived(Math.max(...points.map((point) => point.total_level)) + 1);
  const plotWidth = $derived(width - padLeft - padRight);
  const plotHeight = height - padTop - padBottom;
  const gained = $derived(points.length ? points.at(-1)!.total_level - points[0]!.total_level : 0);

  const xOf = (ms: number) => padLeft + ((ms - first) / span) * plotWidth;
  const yOf = (level: number) =>
    padTop + plotHeight - ((level - low) / Math.max(1, high - low)) * plotHeight;

  const line = $derived.by(() => {
    if (!points.length) return '';
    const parts = [`M${xOf(first).toFixed(1)},${yOf(points[0]!.total_level).toFixed(1)}`];
    for (const point of points.slice(1)) {
      parts.push(`H${xOf(point.ms).toFixed(1)}`, `V${yOf(point.total_level).toFixed(1)}`);
    }
    parts.push(`H${xOf(last).toFixed(1)}`);
    return parts.join(' ');
  });
  const area = $derived(
    line ? `${line} V${(padTop + plotHeight).toFixed(1)} H${xOf(first).toFixed(1)} Z` : ''
  );
  const local = $derived(browser ? clock.local : false);
  const dateOf = (ms: number) =>
    new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: local ? undefined : 'UTC'
    }).format(new Date(ms));
</script>

{#if points.length < 2}
  <p class="note">{t.player.historyEmpty}</p>
{:else}
  <div bind:clientWidth={width}>
    <svg
      viewBox="0 0 {width} {height}"
      {height}
      class="block w-full font-sans text-ink-muted"
      role="img"
      aria-label={t.player.historyLabel(
        points[0]!.total_level,
        points.at(-1)!.total_level,
        formatDateTime(points[0]!.saved_at, local)
      )}
    >
      {#each [low, Math.round((low + high) / 2), high] as tick (tick)}
        <line
          x1={padLeft}
          x2={width - padRight}
          y1={yOf(tick)}
          y2={yOf(tick)}
          stroke="var(--color-line)"
        />
        <text x={padLeft - 6} y={yOf(tick) + 3} text-anchor="end" font-size="10" fill="currentColor"
          >{tick}</text
        >
      {/each}
      <path d={area} fill="var(--color-gold)" fill-opacity="0.16" />
      <path d={line} fill="none" stroke="var(--color-gold)" stroke-width="2" />
      {#each points.slice(1, -1) as point (point.ms)}
        <circle cx={xOf(point.ms)} cy={yOf(point.total_level)} r="2.5" fill="var(--color-gold)" />
      {/each}
      <text x={padLeft} y={height - 6} font-size="10" fill="currentColor">{dateOf(first)}</text>
      <text x={width - padRight} y={height - 6} text-anchor="end" font-size="10" fill="currentColor"
        >{dateOf(last)}</text
      >
    </svg>
  </div>
  <p class="mt-1.5 text-[0.72rem] text-ink-muted">{t.player.levelsGained(gained)}</p>
{/if}
