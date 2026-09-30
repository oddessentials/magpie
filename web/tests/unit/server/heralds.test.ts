import { describe, expect, it } from 'vitest';
import { crossedMinute, heralds, maxStepSeconds } from '$lib/server/jobs/heralds';
import { daySeconds } from '$lib/world/clock';

const at = (day: number, hour: number, minute = 0) => day * daySeconds + hour * 60 + minute;

describe('the nightfall and dawn warnings', () => {
  it('warn two hours before nightfall and half an hour before dawn', () => {
    expect(heralds.map(({ type, minute, lead }) => [type, minute, lead])).toEqual([
      ['world.dusk_approaching', 20 * 60, 120],
      ['world.dawn_approaching', 4 * 60, 30]
    ]);
  });

  it('finds the moment the clock passed a warning, across midnight too', () => {
    expect(crossedMinute(at(7, 19, 58), at(7, 20, 3), 20 * 60)).toBe(at(7, 20));
    expect(crossedMinute(at(7, 3, 59), at(7, 4, 0), 4 * 60)).toBe(at(7, 4));
    expect(crossedMinute(at(7, 23, 50), at(8, 0, 20), 0)).toBe(at(8, 0));
  });

  it('ignores a clock that stood still, went back or jumped', () => {
    expect(crossedMinute(at(7, 20, 1), at(7, 20, 9), 20 * 60)).toBeNull();
    expect(crossedMinute(at(7, 20, 5), at(7, 19, 55), 20 * 60)).toBeNull();
    expect(crossedMinute(at(7, 19, 0), at(7, 19, 0), 20 * 60)).toBeNull();
    expect(crossedMinute(at(7, 19, 30), at(7, 19, 30) + maxStepSeconds + 1, 20 * 60)).toBeNull();
  });
});
