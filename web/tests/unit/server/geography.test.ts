import { describe, expect, it } from 'vitest';
import { bossNameOf, mapGuide, regionNameOf } from '../../../src/lib/server/read/geography';

describe('names from map facts', () => {
  it('resolves saved region numbers and boss internal names', () => {
    expect(regionNameOf(1)).toBe('Temple Woods');
    expect(bossNameOf('ai_boss_velgar')).toBe('General Velgar');
    expect(bossNameOf(' BP_AI_DragonVelgar_Data ')).toBe('General Velgar');
  });

  it('leaves unknown identifiers available to the caller', () => {
    expect(regionNameOf(999)).toBeNull();
    expect(bossNameOf('future_boss') ?? 'future_boss').toBe('future_boss');
    expect(bossNameOf(null)).toBeNull();
  });

  it('ships a named guide without geometry or internal actor paths', () => {
    expect(mapGuide.build).toBeGreaterThan(0);
    expect(mapGuide.regions.every((region) => region.name)).toBe(true);
    expect(mapGuide.lodestones.every((stone) => stone.name)).toBe(true);
    expect(JSON.stringify(mapGuide)).not.toMatch(/BoundarySpline|_Generated_|\.uasset/);
  });
});
