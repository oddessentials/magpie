<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { ApiError, api } from '$lib/api/client';
  import type { AdminSettings, AdminSettingsUpdate, Retention, SiteFeatures } from '$lib/api/types';
  import Card from '$lib/ui/Card.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import { t } from '$lib/ui/strings';

  let { data } = $props();

  const features = (['chat'] as const).map((name) => ({
    name,
    ...t.admin.settings.features[name]
  }));

  const periods = (['metrics_days', 'status_samples_days', 'world_saves_days'] as const).map(
    (name) => ({ name, max: 3650, ...t.admin.settings.retention[name] })
  );

  let saved = $state<AdminSettings | null>(
    untrack(() => (data.settings.ok ? data.settings.data : null))
  );
  let siteName = $state(untrack(() => saved?.site_name ?? ''));
  let toggles = $state<SiteFeatures>(
    untrack(() => (saved ? { ...saved.features } : { chat: false }))
  );
  let keep = $state<Record<keyof Retention, string>>(
    untrack(() => periodFields(saved?.retention ?? null))
  );
  let message = $state('');
  let problem = $state('');
  let busy = $state(false);

  const nameLocked = $derived(saved?.locked.includes('site_name') ?? false);

  function periodFields(retention: Retention | null): Record<keyof Retention, string> {
    return {
      metrics_days: String(retention?.metrics_days ?? 30),
      status_samples_days: String(retention?.status_samples_days ?? 90),
      world_saves_days: String(retention?.world_saves_days ?? 30)
    };
  }

  function retentionChanges(): Partial<Retention> | string {
    const changes: Partial<Retention> = {};
    for (const period of periods) {
      const raw = String(keep[period.name] ?? '').trim();
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1 || value > period.max) {
        return t.admin.settings.retentionRange(period.label, period.unit, period.max);
      }
      if (saved!.retention[period.name] !== value) changes[period.name] = value;
    }
    return changes;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = '';
    problem = '';
    if (!saved) return;
    const body: AdminSettingsUpdate = {};
    const name = siteName.trim();
    if (!nameLocked && name !== saved.site_name) {
      if (name.length < 1 || name.length > 60) {
        problem = t.admin.settings.nameLength;
        return;
      }
      body.site_name = name;
    }
    const changed = Object.fromEntries(
      Object.entries(toggles).filter(
        ([key, value]) => saved!.features[key as keyof SiteFeatures] !== value
      )
    );
    if (Object.keys(changed).length > 0) body.features = changed;
    const retention = retentionChanges();
    if (typeof retention === 'string') {
      problem = retention;
      return;
    }
    if (Object.keys(retention).length > 0) body.retention = retention;
    if (Object.keys(body).length === 0) {
      message = t.admin.settings.nothingChanged;
      return;
    }
    busy = true;
    try {
      saved = await api.updateAdminSettings(body);
      siteName = saved.site_name;
      toggles = { ...saved.features };
      keep = periodFields(saved.retention);
      message = t.admin.settings.saved;
      await invalidateAll();
    } catch (error) {
      problem =
        error instanceof ApiError && error.status === 403
          ? t.admin.settings.refused
          : error instanceof Error
            ? error.message
            : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<Meta title={t.admin.settings.title} description={t.admin.settings.description} />

<div class="flex flex-col gap-6">
  <PageHeader eyebrow={t.admin.rail} note={t.admin.settings.note}>
    {#snippet heading()}{t.admin.settings.title}{/snippet}
  </PageHeader>

  {#if !data.settings.ok}
    <ErrorNote error={data.settings.error} what="the settings" />
  {:else}
    <Card title={t.admin.settings.site}>
      <form class="flex flex-col gap-5 text-[0.875rem]" onsubmit={submit}>
        <label class="flex flex-col gap-1.5">
          <span class="label">{t.admin.settings.siteName}</span>
          <input
            type="text"
            class="field"
            maxlength="60"
            disabled={nameLocked}
            bind:value={siteName}
          />
          <span class="note"
            >{nameLocked ? t.admin.settings.nameLocked : t.admin.settings.nameNote}</span
          >
        </label>

        <fieldset class="flex flex-col gap-3">
          <legend class="label">{t.admin.settings.featuresLegend}</legend>
          {#each features as option (option.name)}
            <div class="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="feature-{option.name}"
                class="mt-1 size-4"
                aria-describedby="feature-{option.name}-note"
                bind:checked={toggles[option.name]}
              />
              <div class="flex flex-col gap-0.5">
                <label for="feature-{option.name}">{option.label}</label>
                <span class="note" id="feature-{option.name}-note">{option.description}</span>
              </div>
            </div>
          {/each}
          <p class="note">{t.admin.settings.featuresNote}</p>
        </fieldset>

        <fieldset class="flex flex-col gap-3">
          <legend class="label">{t.admin.settings.retentionLegend}</legend>
          {#each periods as period (period.name)}
            <div class="flex flex-col gap-1">
              <label class="flex flex-wrap items-center gap-2" for="keep-{period.name}">
                <span class="min-w-40">{period.label}</span>
                <input
                  type="number"
                  id="keep-{period.name}"
                  class="field w-28"
                  min="1"
                  max={period.max}
                  step="1"
                  inputmode="numeric"
                  aria-describedby="keep-{period.name}-note"
                  bind:value={keep[period.name]}
                />
                <span class="text-ink-muted">{period.unit}</span>
              </label>
              <span class="note" id="keep-{period.name}-note">{period.description}</span>
            </div>
          {/each}
          <p class="note">{t.admin.settings.retentionNote}</p>
        </fieldset>

        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" class="btn btn-primary" disabled={busy}
            >{t.admin.settings.save}</button
          >
          {#if problem}<span class="text-danger" role="alert">{problem}</span>{/if}
          {#if message}<span role="status">{message}</span>{/if}
        </div>
      </form>
    </Card>
  {/if}
</div>
