<script lang="ts">
  import type { Platform } from '$lib/api/types';

  let { platform }: { platform: Platform } = $props();
</script>

<span class="chip text-ink-muted">{platform}</span>
