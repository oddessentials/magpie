<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { ApiError, api } from '$lib/api/client';
  import Meta from '$lib/ui/Meta.svelte';
  import { t } from '$lib/ui/strings';

  let { data } = $props();
  let password = $state('');
  let message = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    message = '';
    try {
      await api.adminLogin(password);
      password = '';
      await invalidateAll();
      await goto('/admin');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) message = t.admin.login.wrong;
      else if (error instanceof ApiError && error.status === 429) message = t.admin.login.tooMany;
      else message = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<Meta title={t.admin.login.title} description={t.admin.login.description} />

<div class="mx-auto flex w-full max-w-sm flex-col gap-5">
  <div class="rise flex flex-col gap-1.5">
    <p class="eyebrow">{t.admin.login.eyebrow}</p>
    <h1 class="page-title">{t.admin.login.title}</h1>
  </div>
  {#if data.authenticated}
    <p class="text-[0.875rem]">
      {t.admin.login.already}
      <a href="/admin" class="text-accent hover:underline">{t.admin.login.goAdmin}</a>
    </p>
  {/if}
  <form class="card rise rise-2 flex flex-col gap-4 p-5 text-[0.875rem]" onsubmit={submit}>
    <label class="flex flex-col gap-1.5">
      <span class="label">{t.admin.login.password}</span>
      <input
        type="password"
        name="password"
        autocomplete="current-password"
        required
        bind:value={password}
        class="field"
      />
    </label>
    <button type="submit" class="btn btn-primary self-start" disabled={busy || password === ''}>
      {t.admin.login.submit}
    </button>
    {#if message}
      <p class="text-danger" role="alert">{message}</p>
    {/if}
    <p class="note">{t.admin.login.note}</p>
  </form>
</div>
