import { describe, expect, it } from 'vitest';
import { rateOf, staleAfterOf, type ClockSave } from '$lib/server/read/status';

const start = Date.UTC(2026, 8, 28, 20, 0);

function save(minutes: number, seconds: number | null, world = 'W'): ClockSave {
  return {
    savedAt: new Date(start + minutes * 60_000),
    worldGuid: world,
    day: 0,
    clockSeconds: seconds
  };
}

describe('the status clock', () => {
  it('goes out of date after twice the longest gap between the newest saves, from 10 to 60 minutes', () => {
    expect(staleAfterOf([])).toBe(600);
    expect(staleAfterOf([save(10, 1)])).toBe(600);
    expect(staleAfterOf([save(10, 1), save(5, 1), save(0, 1)])).toBe(600);
    expect(staleAfterOf([save(30, 1), save(15, 1), save(14, 1)])).toBe(1800);
    expect(staleAfterOf([save(200, 1), save(100, 1)])).toBe(3600);
    expect(staleAfterOf([save(30, 1), save(15, 1, 'other')])).toBe(600);
  });

  it('measures the rate over at least ten minutes and only between 0.9 and 1', () => {
    expect(rateOf(save(10, 900), null)).toBe(1);
    expect(rateOf(save(5, 300), save(0, 0))).toBe(1);
    expect(rateOf(save(20, 1194), save(0, 0))).toBeCloseTo(0.995, 9);
    expect(rateOf(save(20, 1300), save(0, 0))).toBe(1);
    expect(rateOf(save(20, 600), save(0, 0))).toBe(1);
    expect(rateOf(save(20, null), save(0, 0))).toBe(1);
  });
});
