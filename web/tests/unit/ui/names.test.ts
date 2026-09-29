import { describe, expect, it } from 'vitest';
import { daysAtPace, levelFor, timesFor, xpFor, xpNeeded } from '$lib/ui/levels';
import { areaKey, areaLabel, categoryLabel, listText, stepText } from '$lib/ui/names';

describe('names from game tags', () => {
  it('reads a category from the last part of an item tag', () => {
    expect(categoryLabel('Item.Equipment.Weapon.1H.Sword')).toBe('Sword');
    expect(categoryLabel('Item.BuildingResource')).toBe('Building resource');
    expect(categoryLabel('Item.QuestItem.KeyItem')).toBe('Key item');
    expect(categoryLabel(null)).toBeNull();
  });

  it('matches areas however the game spells them', () => {
    expect(areaLabel('DowdunReach')).toBe('Dowdun Reach');
    expect(areaLabel('Umbral_Sands')).toBe('Umbral Sands');
    expect(areaKey('Dowdun Reach')).toBe(areaKey('DowdunReach'));
    expect(areaKey('Umbral_Sands')).toBe(areaKey('UmbralSands'));
  });

  it('says what an unlock step asks for', () => {
    const base = { items: [], actors: [], skill: null, level: null };
    expect(listText(['Ash Logs', 'Stone', 'Clay'], 'or')).toBe('Ash Logs, Stone or Clay');
    expect(
      stepText({
        ...base,
        kind: 'pick_up',
        match: 'any',
        items: [
          { asset: 'a', name: 'Ash Logs' },
          { asset: 'b', name: null }
        ]
      })
    ).toBe('Pick up Ash Logs or b');
    expect(
      stepText({ ...base, kind: 'interact', match: 'all', actors: [{ class: 'x', name: 'Loom' }] })
    ).toBe('Use Loom');
    expect(
      stepText({
        ...base,
        kind: 'skill_level',
        match: 'all',
        skill: { asset: 'SKILL_Runecrafting', name: 'Runecrafting' },
        level: 6
      })
    ).toBe('Reach level 6 in Runecrafting');
  });
});

describe('levels from the experience curve', () => {
  const curve = [0, 33, 70, 111, 156];

  it('finds the level for an amount of experience', () => {
    expect(levelFor(curve, 0)).toBe(1);
    expect(levelFor(curve, 69)).toBe(2);
    expect(levelFor(curve, 70)).toBe(3);
    expect(levelFor(curve, 10_000)).toBe(5);
    expect(xpFor(curve, 4)).toBe(111);
    expect(xpFor(curve, 9)).toBeNull();
  });

  it('works out what a level still needs and how long it takes', () => {
    expect(xpNeeded(curve, 50, 4)).toBe(61);
    expect(xpNeeded(curve, 200, 4)).toBe(0);
    expect(daysAtPace(61, 70)).toBe(7);
    expect(daysAtPace(61, 0)).toBeNull();
    expect(daysAtPace(0, 0)).toBe(0);
    expect(timesFor(61, 15)).toBe(5);
    expect(timesFor(61, 0)).toBeNull();
  });
});
