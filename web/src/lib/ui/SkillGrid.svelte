<script lang="ts">
  import type { PlayerCharacter } from '$lib/api/types';
  import { formatNumber } from './format';
  import { t } from './strings';

  let { character }: { character: PlayerCharacter | null } = $props();

  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const cells = $derived.by(() => {
    const skills = character?.skills ?? [];
    const count = Math.max(12, skills.length);
    return Array.from({ length: count }, (_, index) => {
      const skill = skills[index];
      const floor = skill?.level_xp ?? 0;
      const share =
        skill && skill.next_level_xp !== null && skill.next_level_xp > floor
          ? Math.max(0, Math.min(1, (skill.xp - floor) / (skill.next_level_xp - floor)))
          : skill && skill.level !== null
            ? 1
            : 0;
      return {
        key: skill?.id ?? `slot-${index}`,
        name: skill?.name ?? t.player.skillPlaceholder(index + 1),
        level: skill?.level ?? null,
        xp: skill ? formatNumber(skill.xp) : null,
        share
      };
    });
  });
</script>

<ul class="skill-grid" aria-label={t.player.skillsTitle}>
  {#each cells as cell (cell.key)}
    <li class="skill-cell">
      <svg class="skill-ring" viewBox="0 0 56 56" aria-hidden="true">
        <circle class="skill-ring-track" cx="28" cy="28" r={radius} />
        <circle
          class="skill-ring-fill"
          cx="28"
          cy="28"
          r={radius}
          stroke-dasharray={circumference}
          stroke-dashoffset={circumference * (1 - cell.share)}
        />
        <text class="skill-ring-level" x="28" y="28">{cell.level ?? '—'}</text>
      </svg>
      <span class="skill-name">{cell.name}</span>
      {#if cell.xp !== null}
        <span class="skill-xp">{cell.xp} {t.player.xp}</span>
      {/if}
    </li>
  {/each}
</ul>
{#if character?.total_level !== null && character?.total_level !== undefined}
  <p class="mt-3 text-[0.875rem]">
    <span class="stat-label">{t.player.totalLevel}</span>
    <span class="stat-value ml-2">{formatNumber(character.total_level)}</span>
  </p>
{/if}
