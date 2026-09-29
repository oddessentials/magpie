<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import Backdrop from '$lib/ui/Backdrop.svelte';
  import { clock } from '$lib/ui/clock.svelte';
  import Emblem from '$lib/ui/Emblem.svelte';
  import { provideLive } from '$lib/ui/live.svelte';
  import SiteNav from '$lib/ui/SiteNav.svelte';
  import StatusStrip from '$lib/ui/StatusStrip.svelte';
  import { t } from '$lib/ui/strings';
  import { versionLine } from '$lib/ui/versions';
  import Wordmark from '$lib/ui/Wordmark.svelte';

  let { data, children } = $props();

  const live = provideLive();

  $effect(() => clock.start());
  $effect(() => {
    if (!data.streamEnabled) return;
    live.start();
    return () => live.stop();
  });

  const status = $derived(live.status ?? data.status);
  const canonical = $derived(`${page.url.origin}${page.url.pathname}`);
</script>

<svelte:head>
  <title>{data.siteName}</title>
  <link rel="canonical" href={canonical} />
  <meta property="og:site_name" content={data.siteName} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonical} />
  <meta name="description" content={t.site.description(data.siteName)} />
</svelte:head>

<div class="relative flex min-h-screen flex-col">
  <a
    href="#main"
    class="sr-only z-50 rounded-md bg-surface-raised px-4 py-2 text-ink shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >{t.site.skip}</a
  >
  <Backdrop />
  <header class="relative z-10 bg-linear-to-b from-surface/90 via-surface/60 to-transparent">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-2 px-(--gutter) pt-4 pb-1">
      <div class="flex items-center gap-4">
        <a href="/" class="flex items-center gap-2.5 text-ink hover:text-accent-bright">
          <Emblem size={32} badge class="text-accent" />
          <Wordmark name={data.siteName} />
        </a>
        <span class="note hidden sm:inline">{t.site.tagline}</span>
      </div>
      <SiteNav entries={data.navigation} />
    </div>
  </header>
  <StatusStrip {status} error={data.statusError} stream={live.stream} />
  <main
    id="main"
    tabindex="-1"
    class="relative z-10 mx-auto w-full max-w-6xl flex-1 px-(--gutter) pt-8 pb-12 focus:outline-none"
  >
    {#key page.url.pathname}
      <div class="pagein">
        {@render children()}
      </div>
    {/key}
  </main>
  <footer class="relative z-10 border-t border-line bg-surface/80 backdrop-blur-sm">
    <div
      class="mx-auto flex w-full max-w-6xl flex-wrap items-end gap-x-8 gap-y-4 px-(--gutter) py-6"
    >
      <div class="flex max-w-2xl flex-col gap-1">
        <span class="note text-accent">{t.site.footerNote}</span>
        <span class="ticker">{t.site.disclaimer}</span>
        <span class="ticker">{t.site.provenance}</span>
        <span class="ticker">{versionLine(__APP_VERSION__, status)}</span>
      </div>
      <nav aria-label={t.site.machineReadable} class="ml-auto flex flex-wrap gap-x-5 gap-y-2">
        <a href="/api/v1/status" class="nav-link px-0">{t.site.statusJson}</a>
        <a href="/api/v1/openapi.json" class="nav-link px-0">{t.site.apiContract}</a>
      </nav>
    </div>
  </footer>
</div>
