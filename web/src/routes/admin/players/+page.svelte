<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { ApiError, api } from '$lib/api/client';
  import type { AdminPlayer } from '$lib/api/types';
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatHours } from '$lib/ui/format';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Pager from '$lib/ui/Pager.svelte';
  import PlatformTag from '$lib/ui/PlatformTag.svelte';
  import { t } from '$lib/ui/strings';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  let editing = $state<number | null>(null);
  let draft = $state('');
  let busy = $state<number | null>(null);
  let problem = $state('');

  const items = $derived(data.players.ok ? data.players.data.items : []);

  function explain(error: unknown): string {
    if (error instanceof ApiError && error.status === 403) return t.admin.players.refused;
    return error instanceof Error ? error.message : String(error);
  }

  async function patch(
    player: AdminPlayer,
    body: { name_override?: string | null; hidden?: boolean }
  ) {
    busy = player.id;
    problem = '';
    try {
      await api.updateAdminPlayer(player.id, body);
      editing = null;
      await invalidateAll();
    } catch (error) {
      problem = explain(error);
    } finally {
      busy = null;
    }
  }

  function startEdit(player: AdminPlayer) {
    editing = player.id;
    draft = player.name_override ?? player.game_name;
  }
</script>

<Meta title={t.admin.players.title} description={t.admin.players.description} />

<div class="flex flex-col gap-6">
  <PageHeader eyebrow={t.admin.rail} note={t.admin.players.note}>
    {#snippet heading()}{t.admin.players.title}{/snippet}
    {#snippet aside()}
      <form method="get" class="flex items-center gap-2 text-[0.875rem]">
        <input
          type="search"
          name="q"
          value={data.q}
          placeholder={t.admin.players.searchPlaceholder}
          class="field w-56"
        />
        <button type="submit" class="btn">{t.admin.players.search}</button>
      </form>
    {/snippet}
  </PageHeader>

  {#if problem}<p class="text-[0.875rem] text-danger" role="alert">{problem}</p>{/if}

  <Card flush>
    {#if !data.players.ok}
      <div class="p-4"><ErrorNote error={data.players.error} what="the players" /></div>
    {:else if items.length === 0}
      <EmptyState message={data.q ? t.admin.players.noMatch : t.admin.players.empty} />
    {:else}
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>{t.admin.players.columns.player}</th>
              <th>{t.admin.players.columns.accountId}</th>
              <th>{t.admin.players.columns.characterGuid}</th>
              <th class="num">{t.admin.players.columns.played}</th>
              <th>{t.admin.players.columns.lastSeen}</th>
              <th><span class="sr-only">{t.admin.players.columns.edit}</span></th>
            </tr>
          </thead>
          <tbody>
            {#each items as player (player.id)}
              <tr class={player.hidden ? 'opacity-60' : ''}>
                <td data-label={t.admin.players.columns.player}>
                  {#if editing === player.id}
                    <form
                      class="flex items-center gap-2"
                      onsubmit={(event) => {
                        event.preventDefault();
                        const value = draft.trim();
                        void patch(player, {
                          name_override: value && value !== player.game_name ? value : null
                        });
                      }}
                    >
                      <input class="field w-40" maxlength="64" bind:value={draft} />
                      <button type="submit" class="btn btn-primary" disabled={busy !== null}
                        >{t.admin.players.save}</button
                      >
                      <button type="button" class="btn" onclick={() => (editing = null)}
                        >{t.admin.players.cancel}</button
                      >
                    </form>
                  {:else}
                    <div class="flex flex-wrap items-center gap-2">
                      <span
                        class="lamp {player.online ? 'text-online' : 'text-line-strong'}"
                        aria-hidden="true"
                      ></span>
                      <a
                        href="/players/{player.id}"
                        class="font-semibold text-accent hover:underline">{player.name}</a
                      >
                      <PlatformTag platform={player.platform} />
                      {#if player.hidden}<span class="chip text-warning"
                          >{t.admin.players.hidden}</span
                        >{/if}
                    </div>
                    {#if player.name_override}
                      <div class="text-[0.74rem] text-ink-muted">
                        {t.admin.players.inGame(player.game_name)}
                      </div>
                    {/if}
                  {/if}
                </td>
                <td data-label={t.admin.players.columns.accountId}
                  ><code class="text-xs break-all">{player.user_id}</code></td
                >
                <td data-label={t.admin.players.columns.characterGuid}
                  ><code class="text-xs break-all">{player.character_guid ?? '—'}</code></td
                >
                <td class="num" data-label={t.admin.players.columns.played}
                  >{formatHours(player.playtime_s)}</td
                >
                <td data-label={t.admin.players.columns.lastSeen}
                  ><Time at={player.last_seen} mode="relative" /></td
                >
                <td class="num whitespace-nowrap">
                  {#if editing !== player.id}
                    <button type="button" class="btn" onclick={() => startEdit(player)}
                      >{t.admin.players.rename}</button
                    >
                    <button
                      type="button"
                      class="btn"
                      disabled={busy !== null}
                      onclick={() => patch(player, { hidden: !player.hidden })}
                      >{player.hidden ? t.admin.players.show : t.admin.players.hide}</button
                    >
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="px-3 pb-3">
        <Pager
          nextCursor={data.players.data.next_cursor}
          count={items.length}
          label={t.admin.players.unit}
        />
      </div>
    {/if}
  </Card>
</div>
