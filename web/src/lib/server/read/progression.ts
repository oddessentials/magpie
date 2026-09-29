import { isQuestComplete } from '$lib/quests';
import type { Database } from '../db/client';
import { savedCharacters, unlocksOf } from './characters';
import { playerRef, type Schemas } from './common';
import { skillFacts } from './facts';
import {
  bossCreatureIds,
  buildingsById,
  countedKinds,
  creaturesById,
  isKnownUnlock,
  journalById,
  liveBuildings,
  liveCreatures,
  liveJournal,
  liveQuests,
  liveRecipes,
  questsById,
  recipeName,
  recipesById
} from './lookup';
import { skillsOf, totalLevelOf } from './saves';

type Progression = Schemas['Progression'];
type Latest = NonNullable<Progression['players'][number]['latest']>;

function latestName(kind: Latest['kind'], id: string): string | null {
  if (kind === 'recipe') {
    const asset = recipesById.get(id)?.asset;
    return asset ? recipeName(asset) : null;
  }
  if (kind === 'building') return buildingsById.get(id)?.name ?? null;
  return journalById.get(id)?.name ?? null;
}

export async function getProgression(db: Database): Promise<Progression> {
  const characters = await savedCharacters(db);
  const rows = (
    await unlocksOf(
      db,
      characters.map((c) => c.save.characterGuid),
      countedKinds
    )
  ).filter(isKnownUnlock);
  const byCharacter = new Map<string, typeof rows>();
  for (const row of rows) {
    byCharacter.set(row.characterGuid, [...(byCharacter.get(row.characterGuid) ?? []), row]);
  }
  const bossNames = new Set(liveCreatures.filter((c) => c.boss && c.name).map((c) => c.name));
  return {
    totals: {
      skills: skillFacts.length,
      quests: liveQuests.filter((q) => !q.hidden && !q.task).length,
      main_quests: liveQuests.filter((q) => q.main).length,
      journal: liveJournal.length,
      recipes: liveRecipes.length,
      buildings: liveBuildings.length,
      bosses: bossNames.size
    },
    players: characters.map(({ player, save }) => {
      const unlocked = byCharacter.get(save.characterGuid) ?? [];
      const count = (kind: string) => unlocked.filter((row) => row.kind === kind).length;
      const skills = skillsOf(save.skills);
      const completed = save.quests.filter((quest) => isQuestComplete(quest.state));
      const bosses = [
        ...new Set(
          unlocked
            .filter((row) => row.kind === 'creature' && bossCreatureIds.has(row.id))
            .map((row) => creaturesById.get(row.id)?.name)
            .filter((name): name is string => Boolean(name))
        )
      ].sort();
      const earliest = unlocked.reduce<Date | null>(
        (min, row) => (!min || row.firstSeenAt < min ? row.firstSeenAt : min),
        null
      );
      const candidates = unlocked
        .filter(
          (row) =>
            (row.kind === 'recipe' || row.kind === 'building' || row.kind === 'journal') &&
            earliest !== null &&
            row.firstSeenAt > earliest
        )
        .sort(
          (a, b) => b.firstSeenAt.getTime() - a.firstSeenAt.getTime() || a.id.localeCompare(b.id)
        );
      const newest = candidates[0];
      return {
        player: playerRef(player),
        saved_at: save.savedAt.toISOString(),
        total_level: totalLevelOf(skills),
        skills: skills.map((skill) => ({
          id: skill.id,
          name: skill.name ?? skill.id,
          level: skill.level
        })),
        quests: {
          completed: completed.length,
          active: save.quests.length - completed.length,
          main_completed: completed.filter((quest) => questsById.get(quest.id)?.main === true)
            .length
        },
        journal: count('journal'),
        recipes: count('recipe'),
        buildings: count('building'),
        creatures: count('creature'),
        bosses,
        latest: newest
          ? {
              kind: newest.kind as Latest['kind'],
              name: latestName(newest.kind as Latest['kind'], newest.id),
              at: newest.firstSeenAt.toISOString()
            }
          : null
      };
    })
  };
}
