import { describe, expect, it } from 'vitest';
import { savedClock } from '$lib/server/read/clock';
import facts from '$lib/world/clock.json';
import evidence from '../../../../savereader/internal/dragonwilds/testdata/engine-save-fields-25501739.json';

describe('the saved game clock', () => {
  it('agrees with the engine setter/getter observations for the extracted day length', () => {
    expect(facts.source.build).toBe(evidence.source.server_build);
    expect(facts.realMinutesPerGameDay).toBe(evidence.real_minutes_per_game_day);
    for (const sample of evidence.clock_samples) {
      const hours = sample.ticks / 10000000 / 3600;
      expect(savedClock(sample.stored_seconds)).toEqual({
        day: Math.floor(hours / 24),
        hour: hours % 24
      });
    }
  });

  it('preserves midnight and fractions and rejects unusable saved clocks', () => {
    expect(savedClock(1440)).toEqual({ day: 1, hour: 0 });
    expect(savedClock(30)).toEqual({ day: 0, hour: 0.5 });
    for (const seconds of [null, undefined, -1, NaN, Infinity, Number.MAX_VALUE])
      expect(savedClock(seconds)).toBeNull();
  });
});
