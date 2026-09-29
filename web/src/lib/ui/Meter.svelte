<script lang="ts">
  import { formatNumber } from './format';

  let {
    label,
    value,
    total = null,
    detail = ''
  }: { label: string; value: number; total?: number | null; detail?: string } = $props();

  const share = $derived(total ? Math.max(0, Math.min(1, value / total)) : 0);
</script>

<div class="flex min-w-0 flex-col gap-1">
  <div class="flex items-baseline justify-between gap-3">
    <span class="stat-label">{label}</span>
    <span class="tabular text-[0.8rem] text-ink">
      {formatNumber(value)}{#if total}<span class="text-ink-muted"
          >{` / ${formatNumber(total)}`}</span
        >{/if}
    </span>
  </div>
  {#if total}
    <div
      class="progress-track"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
    >
      <span class="progress-fill" style:width={`${share * 100}%`}></span>
    </div>
  {/if}
  {#if detail}<span class="stat-detail">{detail}</span>{/if}
</div>
