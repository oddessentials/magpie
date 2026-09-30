import { describe, expect, it } from 'vitest';
import {
  clockCountdown,
  clockLabel,
  clockNote,
  compactDuration,
  phaseLabel,
  stripClock
} from '$lib/ui/sunclock';
import { daySeconds, readingOf } from '$lib/world/clock';

const at = (day: number, hour: number, minute = 0) => day * daySeconds + hour * 60 + minute;

describe('the clock labels', () => {
  it('names the phases', () => {
    expect(
      ['night', 'morning', 'afternoon', 'evening'].map((phase) => phaseLabel(phase as 'night'))
    ).toEqual(['Night', 'Morning', 'Afternoon', 'Evening']);
  });

  it('counts seconds under a minute and whole minutes above', () => {
    expect(compactDuration(-5)).toBe('0 s');
    expect(compactDuration(42.4)).toBe('42 s');
    expect(compactDuration(59.6)).toBe('1 min');
    expect(compactDuration(510)).toBe('9 min');
  });

  it('counts down to the next turn while live and explains every other state', () => {
    expect(clockCountdown(readingOf('live', at(7, 13, 30)))).toBe('Nightfall in 9 min');
    expect(clockNote(readingOf('live', at(7, 1)))).toBe('Dawn in 4 min');
    expect(clockNote(readingOf('stopped', at(7, 1)))).toBe('Server down, the world waits here');
    expect(clockNote(readingOf('lost', at(7, 1)))).toBe('Last known, the collector is silent');
    expect(clockNote(readingOf('stale', at(7, 1)))).toBe('Last known, no newer save');
  });

  it('writes the strip and the timer label', () => {
    const reading = readingOf('live', at(600, 0, 5));
    expect(stripClock(reading)).toBe('Day 600 · 00:05');
    expect(clockLabel(reading, clockNote(reading))).toBe(
      'In-game clock: Day 600, 00:05, Night, Dawn in 4 min'
    );
    expect(clockLabel(null, 'No world save read yet')).toBe(
      'In-game clock: No world save read yet'
    );
  });
});
