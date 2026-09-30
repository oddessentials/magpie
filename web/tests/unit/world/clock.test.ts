import { describe, expect, it } from 'vitest';
import type { Status, StatusClock } from '$lib/api/types';
import {
  clockAt,
  dawnMinute,
  daySeconds,
  duskMinute,
  firstMinute,
  formatClock,
  minutesPerDay,
  nextTurn,
  phaseOf,
  readClock,
  savedClock,
  ticksPerMinute
} from '$lib/world/clock';
import facts from '$lib/world/clock.json';
import evidence from '../../../../savereader/internal/dragonwilds/testdata/engine-save-fields-25501739.json';
import observed from '../../../../savereader/internal/dragonwilds/testdata/engine-clock-25501739.json';

const saved = Date.parse('2026-09-28T20:29:00.000Z');
const noon = 12 * 60;

function status(over: Partial<Status> = {}, clock: Partial<StatusClock> = {}): Status {
  return {
    state: 'online',
    since: '2026-09-28T01:33:00.000Z',
    server: { name: null, version: null, world_name: null },
    players: { online: 0, max: null, observed_at: null },
    process: { memory_mb: null, uptime_s: null, cpu_percent: null, measured_at: null },
    save: {
      saved_at: new Date(saved).toISOString(),
      day: 7,
      clock: {
        seconds: 7 * daySeconds + noon,
        observed_at: new Date(saved).toISOString(),
        rate: 1,
        stale_after_s: 600,
        ...clock
      }
    },
    collector: { remote: null, state: 'active', version: null, last_seen_at: null, layers: null },
    stopping: false,
    updated_at: new Date(saved).toISOString(),
    ...over
  };
}

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

  it('counts days from 0 the way the game does, so a new world starts on day 0 at 11:00', () => {
    expect(observed.source.server_build).toBe(facts.source.build);
    expect(observed.day_count.format).toBe('%i');
    const divisor = observed.day_count.divisor_ticks;
    for (const seconds of [0, 660, 1439.9, 1440, 2671.59, 862_560]) {
      expect(clockAt(seconds).day).toBe(Math.trunc((seconds * ticksPerMinute) / divisor));
    }
    const fresh = clockAt((firstMinute * daySeconds) / minutesPerDay);
    expect(fresh).toEqual({ day: 0, minute: 660 });
    expect(formatClock(fresh.minute)).toBe('11:00');
  });

  it('keeps running with nobody connected', () => {
    const [first, second] = observed.empty_world_autosaves;
    const elapsed = (Date.parse(second!.saved_at) - Date.parse(first!.saved_at)) / 1000;
    const rate = (second!.stored_seconds - first!.stored_seconds) / elapsed;
    expect(rate).toBeGreaterThan(0.99);
    expect(rate).toBeLessThanOrEqual(1);
  });

  it('loses the time of a long server frame, which the measured rate absorbs', () => {
    const [first, second] = observed.stall.autosaves;
    const elapsed = (Date.parse(second!.saved_at) - Date.parse(first!.saved_at)) / 1000;
    const lost = elapsed - (second!.stored_seconds - first!.stored_seconds);
    expect(lost).toBeGreaterThan(1);
    expect(lost).toBeLessThan(observed.stall.frame_seconds);
  });
});

describe('the clock face', () => {
  it('turns at the extracted dawn and dusk', () => {
    expect([dawnMinute, duskMinute]).toEqual([270, 1320]);
    expect(phaseOf(269.9)).toBe('night');
    expect(phaseOf(270)).toBe('morning');
    expect(phaseOf(12 * 60)).toBe('afternoon');
    expect(phaseOf(18 * 60)).toBe('evening');
    expect(phaseOf(1319.9)).toBe('evening');
    expect(phaseOf(1320)).toBe('night');
  });

  it('counts down to nightfall and dawn in real seconds', () => {
    expect(nextTurn(21 * 60)).toEqual({ kind: 'nightfall', inSeconds: 60 });
    expect(nextTurn(23 * 60)).toEqual({ kind: 'dawn', inSeconds: 330 });
    expect(nextTurn(3 * 60)).toEqual({ kind: 'dawn', inSeconds: 90 });
    expect(nextTurn(21 * 60, 0.96).inSeconds).toBeCloseTo(62.5, 6);
  });

  it('formats whole in-game minutes', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(754.5)).toBe('12:34');
    expect(formatClock(1439.99)).toBe('23:59');
  });
});

describe('reading the clock from the status', () => {
  it('runs one in-game minute per real second from the save while the server is up', () => {
    const reading = readClock(status(), saved + 90_000);
    expect(reading).toMatchObject({ state: 'live', day: 7, clock: '13:30', phase: 'afternoon' });
    expect(reading?.turn).toEqual({ kind: 'nightfall', inSeconds: 510 });
  });

  it('resumes from the save after a restart instead of counting the downtime', () => {
    const since = new Date(saved + 3 * 3_600_000).toISOString();
    const reading = readClock(status({ since }), saved + 3 * 3_600_000 + 30_000);
    expect(reading?.seconds).toBe(7 * daySeconds + noon + 30);
  });

  it('applies the measured rate', () => {
    const reading = readClock(status({}, { rate: 0.995 }), saved + 300_000);
    expect(reading?.seconds).toBeCloseTo(7 * daySeconds + noon + 298.5, 6);
  });

  it('holds the saved clock when the server is offline, since the world resumes there', () => {
    const reading = readClock(status({ state: 'offline' }), saved + 7_200_000);
    expect(reading).toMatchObject({
      state: 'stopped',
      seconds: 7 * daySeconds + noon,
      clock: '12:00'
    });
  });

  it('shows the last known clock when the collector is silent or the state is unknown', () => {
    const lost = status({
      state: 'unknown',
      collector: { remote: null, state: 'lost', version: null, last_seen_at: null, layers: null }
    });
    expect(readClock(lost, saved + 600_000)).toMatchObject({ state: 'lost', clock: '12:00' });
    expect(readClock(status({ state: 'unknown' }), saved + 600_000)?.state).toBe('lost');
  });

  it('stops projecting once no newer save has arrived in time', () => {
    const reading = readClock(status(), saved + 601_000);
    expect(reading).toMatchObject({ state: 'stale', seconds: 7 * daySeconds + noon + 600 });
  });

  it('has nothing to read without a saved clock', () => {
    const none = status();
    none.save.clock = null;
    expect(readClock(none, saved)).toBeNull();
  });
});
