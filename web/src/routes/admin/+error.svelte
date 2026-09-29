<script lang="ts">
  import { page } from '$app/state';
  import Emblem from '$lib/ui/Emblem.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import { t } from '$lib/ui/strings';
</script>

<Meta
  title={`${page.status} ${page.error?.message ?? t.errors.somethingWrong}`}
  description={t.errors.notFoundNote}
/>

<div
  class="card mx-auto grid max-w-4xl grid-cols-1 items-center gap-8 p-6 md:grid-cols-[minmax(0,2fr)_minmax(0,5fr)] md:p-8"
>
  <div class="rise order-last flex justify-center md:order-first">
    <Emblem size={140} class="text-accent" />
  </div>
  <div class="rise rise-2 flex flex-col gap-3">
    <p class="eyebrow">{page.status}</p>
    <h1 class="page-title">
      {#if page.status === 401 || page.status === 403}
        {t.errors.adminNeeded}
      {:else if page.status === 404}
        {t.errors.nothingHere}
      {:else}
        {t.errors.somethingWrong}
      {/if}
    </h1>
    <p class="note text-[1.25rem]">{t.errors.notFoundNote}</p>
    <p class="text-[0.875rem] text-ink-muted">
      {page.status}: {page.error?.message ?? t.errors.unknownError}
    </p>
    <p class="flex flex-wrap gap-3">
      <a href="/admin/login" class="btn btn-primary">{t.errors.logIn}</a>
      <a href="/" class="btn">{t.errors.backToToday}</a>
    </p>
  </div>
</div>
