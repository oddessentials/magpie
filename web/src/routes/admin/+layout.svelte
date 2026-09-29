<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/api/client';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { isCurrent } from '$lib/ui/navigation';
  import { t } from '$lib/ui/strings';
  import Time from '$lib/ui/Time.svelte';

  let { data, children } = $props();
  let message = $state('');

  const links = [
    { href: '/admin', label: t.admin.links.health },
    { href: '/admin/players', label: t.admin.links.players },
    { href: '/admin/events', label: t.admin.links.events },
    { href: '/admin/collector', label: t.admin.links.collector },
    { href: '/admin/settings', label: t.admin.links.settings }
  ];

  async function logout() {
    try {
      await api.adminLogout();
      await invalidateAll();
      await goto('/admin/login');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
  }
</script>

<div class="flex flex-col gap-6">
  <div class="glass flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-[0.875rem]">
    <span class="rail">{t.admin.rail}</span>
    {#if data.authenticated}
      <nav aria-label={t.admin.navLabel} class="flex flex-wrap gap-1">
        {#each links as link (link.href)}
          <a
            href={link.href}
            aria-current={isCurrent(page.url.pathname, link.href) &&
            (link.href !== '/admin' || page.url.pathname === '/admin')
              ? 'page'
              : undefined}
            class="seg">{link.label}</a
          >
        {/each}
      </nav>
      <span class="ticker ml-auto">
        {t.admin.sessionEnds}
        <Time at={data.expiresAt} mode="relative" fallback={t.admin.unknownTime} />
      </span>
      <button type="button" class="btn" onclick={logout}>{t.admin.logOut}</button>
    {:else}
      <span class="ticker">{data.setupRequired ? t.admin.firstStart : t.admin.notLoggedIn}</span>
    {/if}
  </div>
  {#if message}
    <p class="text-[0.875rem] text-danger" role="alert">{message}</p>
  {/if}
  {#if data.sessionError}
    <ErrorNote error={data.sessionError} what="the admin session" />
  {/if}
  {@render children()}
</div>
