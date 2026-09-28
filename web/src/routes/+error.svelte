<script lang="ts">
  import { page } from '$app/state';
  import Emblem from '$lib/ui/Emblem.svelte';
  import { t } from '$lib/ui/strings';

  const missing = $derived(page.status === 404);
</script>

<svelte:head>
  <title>{missing ? t.errors.pageNotFound : t.errors.somethingWrong}</title>
</svelte:head>

<div class="grid grid-cols-1 items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
  <div class="flex justify-center">
    <Emblem size={180} class="text-accent" />
  </div>
  <div class="flex flex-col gap-3">
    <p class="eyebrow">{page.status}</p>
    <h1 class="page-title">{missing ? t.errors.pageNotFound : t.errors.pageBroken}</h1>
    <p class="note text-[1.35rem]">{missing ? t.errors.notFoundNote : t.errors.brokenNote}</p>
    <p class="text-[0.875rem] text-ink-muted">{page.error?.message ?? ''}</p>
    <p><a href="/" class="btn btn-primary">{t.errors.backToToday}</a></p>
  </div>
</div>
