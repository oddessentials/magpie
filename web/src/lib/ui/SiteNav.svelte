<script lang="ts">
  import { page } from '$app/state';
  import { isCurrent, type NavigationLink } from './navigation';
  import { t } from './strings';

  let { entries }: { entries: NavigationLink[] } = $props();
  const current = $derived(page.url.pathname);
</script>

<nav aria-label={t.nav.label} class="site-nav -mx-2">
  {#each entries as entry (entry.href)}
    <a
      href={entry.href}
      aria-current={isCurrent(current, entry.href) ? 'page' : undefined}
      class="nav-link {entry.group === 'admin' ? 'ml-auto' : ''}"
    >
      {entry.label}
    </a>
  {/each}
</nav>
