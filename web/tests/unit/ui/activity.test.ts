import { describe, expect, it } from 'vitest';
import type { ActivityDetails, ActivityItem, ActivityType } from '$lib/api/types';
import { deathPhrase, describeActivity, mergeActivity, upsertActivity } from '$lib/ui/activity';
import { humanize, journalCategory, journalName } from '$lib/ui/strings';

const player = { id: 3, name: 'Moss' };

function line(
  type: ActivityType,
  details: ActivityDetails,
  who: { id: number; name: string } | null = player
): string {
  const item: ActivityItem = { id: 'e', type, ts: '2026-09-28T15:00:00Z', player: who, details };
  return describeActivity(item)
    .parts.map((part) => (part.kind === 'player' ? part.player.name : part.text))
    .join('');
}

describe('feed lines', () => {
  it('names what killed a player', () => {
    expect(deathPhrase({ killer: 'a chicken', cause: 'combat' })).toBe(' was slain by a chicken');
    expect(deathPhrase({ killer: null, cause: 'fall_damage' })).toBe(' died of fall damage');
    expect(deathPhrase({ killer: null, cause: null })).toBe(' died');
  });

  it('describes discoveries, level-ups, quests, stops and kicks', () => {
    expect(
      line('journal.unlocked', { entry: 'JOURNAL_World_Fauna_Chicken', entry_name: null })
    ).toBe('Moss discovered Chicken');
    expect(
      line('journal.unlocked', { entry: 'JOURNAL_World_Flora_AshSapling', entry_name: null })
    ).toBe('Moss discovered Ash Sapling');
    expect(line('skill.level_up', { skill: 'ABCDEF12', skill_name: 'Mining', level: 12 })).toBe(
      'Moss reached level 12 in Mining'
    );
    expect(line('skill.level_up', { skill: 'ABCDEF12', skill_name: null, level: 2 })).toBe(
      'Moss reached level 2 in ABCDEF12'
    );
    expect(
      line('quest.updated', {
        quest: 'QUEST_Brynmoor_Arrival',
        quest_name: null,
        state: 'Completed',
        objective: null
      })
    ).toBe('Moss completed QUEST Brynmoor Arrival');
    expect(line('server.stopping', { by: 'collector' })).toBe(
      'The server is saving, then stopping, as collector asked'
    );
    expect(line('server.stopping', { by: 'admin', save: 'failed' })).toBe(
      'The world save failed; the server keeps running'
    );
    expect(line('server.offline', { reason: 'crashed' })).toBe('The server crashed');
    expect(line('player.kicked', { by: null, reason: null })).toBe('Moss was kicked');
    expect(line('player.joined', {}, null)).toBe('Someone entered the wilds');
  });

  it('turns journal ids into words', () => {
    expect(journalName('JOURNAL_Recipes_Empty_Resources_Stone')).toBe('Resources Stone');
    expect(journalCategory('JOURNAL_Know_Place_BramblemeadValley')).toBe('Place');
    expect(journalCategory('JOURNAL_Odd')).toBeNull();
    expect(humanize('EWeatherType::Cloudy')).toBe('EWeather Type::Cloudy');
  });
});

describe('the live feed on an open page', () => {
  const death = (id: string, ts: string, killer: string | null = null): ActivityItem => ({
    id,
    type: 'player.died',
    ts,
    player,
    details: { killer, cause: killer ? 'combat' : null }
  });
  const first = death('a', '2026-09-28T15:00:00Z');
  const merged = death('a', '2026-09-28T15:00:00Z', 'a wolf');
  const later = death('b', '2026-09-28T15:01:00Z');

  it('replaces an item it already holds by id and puts new items first', () => {
    expect(upsertActivity([], first, 3)).toEqual([first]);
    expect(upsertActivity([later, first], merged, 3)).toEqual([later, merged]);
    expect(upsertActivity([first], later, 3)).toEqual([later, first]);
    expect(upsertActivity([later, first], death('c', '2026-09-28T15:02:00Z'), 2)).toEqual([
      death('c', '2026-09-28T15:02:00Z'),
      later
    ]);
  });

  it('keeps the live copy of an item over the loaded one', () => {
    expect(mergeActivity([merged], [later, first])).toEqual([later, merged]);
    expect(mergeActivity([], [later, first])).toEqual([later, first]);
  });
});
