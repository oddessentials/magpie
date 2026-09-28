<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { ApiError, api } from '$lib/api/client';
  import Meta from '$lib/ui/Meta.svelte';
  import { t } from '$lib/ui/strings';

  const minimumLength = 8;
  const maximumLength = 200;

  let password = $state('');
  let repeated = $state('');
  let message = $state('');
  let busy = $state(false);

  const mismatch = $derived(repeated !== '' && repeated !== password);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = '';
    if (password.length < minimumLength) {
      message = t.admin.setup.tooShort(minimumLength);
      return;
    }
    if (password !== repeated) {
      message = t.admin.setup.mismatch;
      return;
    }
    busy = true;
    try {
      await api.adminSetup(password);
      password = '';
      repeated = '';
      await invalidateAll();
      await goto('/admin');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) message = t.admin.setup.alreadySet;
      else if (error instanceof ApiError && error.status === 429) message = t.admin.setup.tooMany;
      else if (error instanceof ApiError && error.status === 403) message = t.admin.setup.refused;
      else message = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<Meta title={t.admin.setup.title} description={t.admin.setup.description} />

<div class="mx-auto flex w-full max-w-sm flex-col gap-5">
  <div class="rise flex flex-col gap-1.5">
    <p class="eyebrow">{t.admin.firstStart}</p>
    <h1 class="page-title">{t.admin.setup.title}</h1>
  </div>
  <form class="card rise rise-2 flex flex-col gap-4 p-5 text-[0.875rem]" onsubmit={submit}>
    <label class="flex flex-col gap-1.5">
      <span class="label">{t.admin.setup.password}</span>
      <input
        type="password"
        name="password"
        autocomplete="new-password"
        maxlength={maximumLength}
        bind:value={password}
        class="field"
      />
    </label>
    <label class="flex flex-col gap-1.5">
      <span class="label">{t.admin.setup.repeat}</span>
      <input
        type="password"
        name="repeated"
        autocomplete="new-password"
        maxlength={maximumLength}
        aria-invalid={mismatch}
        bind:value={repeated}
        class="field"
      />
    </label>
    <button
      type="submit"
      class="btn btn-primary self-start"
      disabled={busy || password === '' || repeated === ''}
    >
      {t.admin.setup.submit}
    </button>
    {#if message}
      <p class="text-danger" role="alert">{message}</p>
    {/if}
    <p class="note">{t.admin.setup.note(minimumLength)}</p>
  </form>
</div>
