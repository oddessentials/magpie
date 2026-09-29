<script lang="ts">
  import { deathPhrase } from '$lib/ui/activity';
  import Card from '$lib/ui/Card.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatDuration, formatHours, formatNumber } from '$lib/ui/format';
  import Freshness from '$lib/ui/Freshness.svelte';
  import { useLive } from '$lib/ui/live.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PlatformTag from '$lib/ui/PlatformTag.svelte';
  import SkillGrid from '$lib/ui/SkillGrid.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import { t } from '$lib/ui/strings';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  const live = useLive();
  const player = $derived(data.player.ok ? data.player.data : null);
  const liveSelf = $derived(live.online?.players.find((entry) => entry.id === player?.id) ?? null);
  const online = $derived(liveSelf !== null || (player?.online ?? false));
  const character = $derived(player?.character ?? null);
  const stats = $derived(
    player
      ? [
          { label: t.player.stats.played, value: formatHours(player.playtime_s) },
          { label: t.player.stats.sessions, value: formatNumber(player.sessions) },
          { label: t.player.stats.deaths, value: formatNumber(player.deaths) },
          ...(player.chat_messages === null
            ? []
            : [{ label: t.player.stats.chat, value: formatNumber(player.chat_messages) }]),
          ...(character
            ? [
                { label: t.player.stats.journal, value: formatNumber(character.journal.unlocked) },
                { label: t.player.stats.quests, value: formatNumber(character.quests.completed) }
              ]
            : [])
        ]
      : []
  );
</script>

{#if !player}
  {#if !data.player.ok}<ErrorNote error={data.player.error} what="this player" />{/if}
{:else}
  <Meta
    title={player.name}
    description={t.player.description(player.name, formatHours(player.playtime_s))}
  />
  <div class="flex flex-col gap-6">
    <header class="rise flex flex-col gap-1">
      <p class="eyebrow flex flex-wrap items-center gap-2">
        <span class="lamp {online ? 'text-online' : 'text-line-strong'}" aria-hidden="true"></span>
        {online ? t.player.online : t.player.offline}
        <PlatformTag platform={player.platform} />
      </p>
      <h1 class="page-title">{player.name}</h1>
      <p class="text-[0.875rem] text-ink-muted">
        {#if online && player.current_session}
          {t.player.onSince} <Time at={player.current_session.joined_at} mode="relative" />
        {:else}
          {t.player.lastSeen} <Time at={player.last_seen} mode="relative" />
        {/if}
      </p>
    </header>

    <div class="rise rise-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {#each stats as stat (stat.label)}
        <div class="card flex flex-col gap-0.5 px-4 py-3">
          <span class="stat-label">{stat.label}</span>
          <span class="stat-value">{stat.value}</span>
        </div>
      {/each}
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div class="flex flex-col gap-6">
        <Card title={t.player.skillsTitle} description={t.player.skillsNote}>
          {#snippet actions()}
            {#if character}<Freshness source="save" at={character.saved_at} />{/if}
          {/snippet}
          {#if character}
            <SkillGrid {character} />
          {:else}
            <p class="note">{t.player.skillsEmpty}</p>
          {/if}
        </Card>

        {#if character}
          <Card title={t.player.characterTitle} description={t.player.characterNote}>
            {#snippet actions()}
              <Freshness source="save" at={character.saved_at} />
            {/snippet}
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat
                label={t.player.playtimeInGame}
                value={formatHours(character.playtime_s) || '—'}
              />
              <Stat
                label={t.player.health}
                value={character.health
                  ? `${formatNumber(character.health.current)} / ${formatNumber(character.health.max)}`
                  : '—'}
              />
              <Stat label={t.player.questsActive} value={formatNumber(character.quests.active)} />
              <Stat label={t.player.questsDone} value={formatNumber(character.quests.completed)} />
              <Stat
                label={t.player.journalUnlocked}
                value={formatNumber(character.journal.unlocked)}
                detail={`${formatNumber(character.journal.unread)} ${t.player.journalUnread.toLowerCase()}`}
              />
              <Stat
                label={t.player.spells}
                value={character.spells === null ? '—' : formatNumber(character.spells)}
              />
              <Stat
                label={t.player.regions}
                value={character.regions_revealed === null
                  ? '—'
                  : formatNumber(character.regions_revealed)}
              />
            </div>
          </Card>
        {/if}

        {#if player.feats}
          <Card title={t.player.seenTitle} description={t.player.seenNote}>
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat
                label={t.player.stats.journal}
                value={formatNumber(player.feats.journal_entries)}
              />
              <Stat label={t.player.levelUps} value={formatNumber(player.feats.level_ups)} />
              <Stat
                label={t.player.stats.quests}
                value={formatNumber(player.feats.quests_completed)}
              />
              <Stat label={t.player.buildings} value={formatNumber(player.feats.buildings)} />
              <Stat label={t.player.crafts} value={formatNumber(player.feats.crafts)} />
            </div>
          </Card>
        {/if}
      </div>

      <div class="flex flex-col gap-6">
        <Card title={t.player.sessionsTitle} flush>
          {#if !data.sessions.ok}
            <div class="p-4"><ErrorNote error={data.sessions.error} what="the sessions" /></div>
          {:else if data.sessions.data.items.length === 0}
            <p class="note p-4">{t.player.sessionsEmpty}</p>
          {:else}
            <div class="overflow-x-auto">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>{t.player.columns.joined}</th>
                    <th class="num">{t.player.columns.length}</th>
                    <th class="num">{t.player.columns.deaths}</th>
                    <th>{t.player.columns.ended}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each data.sessions.data.items as session (session.id)}
                    <tr>
                      <td data-label={t.player.columns.joined}><Time at={session.joined_at} /></td>
                      <td class="num" data-label={t.player.columns.length}>
                        {session.duration_s === null
                          ? t.time.ongoing
                          : formatDuration(session.duration_s)}
                      </td>
                      <td class="num" data-label={t.player.columns.deaths}
                        >{formatNumber(session.deaths)}</td
                      >
                      <td class="text-ink-muted" data-label={t.player.columns.ended}>
                        {session.end_reason ? t.player.endReasons[session.end_reason] : ''}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </Card>

        <Card title={t.player.deathsTitle}>
          {#if player.recent_deaths.length === 0}
            <p class="note">{t.player.deathsEmpty}</p>
          {:else}
            <ul class="flex flex-col gap-1.5 text-[0.875rem]">
              {#each player.recent_deaths as death, index (index)}
                <li class="flex flex-wrap gap-x-3">
                  <Time at={death.at} />
                  <span>{player.name}{deathPhrase(death)}</span>
                  <span class="text-ink-muted">{t.player.deathSource[death.source]}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </Card>
      </div>
    </div>
  </div>
{/if}
