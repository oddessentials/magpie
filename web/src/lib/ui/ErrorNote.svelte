<script lang="ts">
  import type { LoadFailure } from './load';
  import { t } from './strings';

  let { error, what = 'this section' }: { error: LoadFailure; what?: string } = $props();

  const explanation = $derived.by(() => {
    switch (error.code) {
      case 'rate_limited':
        return t.errors.rateLimited;
      case 'unavailable':
        return t.errors.unavailable;
      case 'not_found':
        return t.errors.notFound;
      case 'unauthorized':
        return t.errors.unauthorized;
      case 'not_implemented':
        return t.errors.notImplemented;
      default:
        return error.message;
    }
  });
</script>

<p
  class="border-l-2 border-danger bg-surface-sunken/60 px-3.5 py-2.5 text-[0.875rem] leading-relaxed"
  role="status"
>
  <span class="font-semibold text-danger">{t.errors.couldNotLoad(what)}</span>
  {explanation}
  <span class="text-ink-muted">({error.status || t.errors.network} {error.code})</span>
</p>
