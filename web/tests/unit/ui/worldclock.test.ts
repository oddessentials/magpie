import { describe, expect, it } from 'vitest';
import type { Status, StatusClock } from '$lib/api/types';
import { idleMs, settleMs, sweepMs, WorldClock, type TimeSource } from '$lib/ui/worldclock.svelte';
import { daySeconds } from '$lib/world/clock';

function fakeSource(reduced = false) {
  let now = 10_000;
  let hidden = false;
  const frames: (() => void)[] = [];
  const waits: { callback: () => void; due: number }[] = [];
  const visible: (() => void)[] = [];
  const source: TimeSource = {
    now: () => now,
    hidden: () => hidden,
    frame: (callback) => {
      frames.push(callback);
      return () => {
        const index = frames.indexOf(callback);
        if (index >= 0) frames.splice(index, 1);
      };
    },
    wait: (callback, ms) => {
      const entry = { callback, due: now + ms };
      waits.push(entry);
      return () => {
        const index = waits.indexOf(entry);
        if (index >= 0) waits.splice(index, 1);
      };
    },
    onVisible: (callback) => {
      visible.push(callback);
      return () => visible.splice(visible.indexOf(callback), 1);
    },
    reducedMotion: () => reduced
  };
  return {
    source,
    frames,
    waits,
    time: () => now,
    advance(ms: number) {
      now += ms;
    },
    hide(value: boolean) {
      hidden = value;
      if (!value) for (const callback of [...visible]) callback();
    },
    runDue() {
      const due = waits.filter((entry) => entry.due <= now);
      for (const entry of due) waits.splice(waits.indexOf(entry), 1);
      for (const entry of due) entry.callback();
      const pending = frames.splice(0, frames.length);
      for (const callback of pending) callback();
    }
  };
}

const updated = Date.parse('2026-09-28T20:30:05.000Z');
const saved = updated - 60_000;
const noon = 7 * daySeconds + 12 * 60;

function status(
  over: Partial<Status> = {},
  clock: Partial<StatusClock> = {},
  at = updated
): Status {
  return {
    state: 'online',
    since: '2026-09-28T01:33:00.000Z',
    server: { name: null, version: null, world_name: null },
    players: { online: 1, max: 6, observed_at: null },
    process: { memory_mb: null, uptime_s: null, cpu_percent: null, measured_at: null },
    save: {
      saved_at: new Date(saved).toISOString(),
      day: 7,
      clock: {
        seconds: noon,
        observed_at: new Date(saved).toISOString(),
        rate: 1,
        stale_after_s: 600,
        ...clock
      }
    },
    collector: { remote: null, state: 'active', version: null, last_seen_at: null, layers: null },
    stopping: false,
    updated_at: new Date(at).toISOString(),
    ...over
  };
}

describe('the world clock store', () => {
  it('reads the status at the moment the site produced it without a time source', () => {
    const clock = new WorldClock(null);
    expect(clock.reading(status())).toMatchObject({ state: 'live', day: 7, clock: '13:00' });
    expect(clock.reading(null)).toBeNull();
    const none = status();
    none.save.clock = null;
    expect(clock.reading(none)).toBeNull();
  });

  it('runs one in-game minute per real second from when the status arrived, not the device clock', () => {
    const fake = fakeSource();
    const clock = new WorldClock(fake.source);
    const frame = status();
    expect(clock.reading(frame)?.clock).toBe('13:00');
    clock.observe(frame);
    fake.advance(90_000);
    expect(clock.reading(frame)).toMatchObject({ state: 'live', clock: '14:30' });
    expect(clock.reading(frame)?.turn).toEqual({ kind: 'nightfall', inSeconds: 450 });
  });

  it('holds the saved clock while the server is offline', () => {
    const fake = fakeSource();
    const clock = new WorldClock(fake.source);
    const offline = status({ state: 'offline' });
    clock.observe(offline);
    fake.advance(600_000);
    expect(clock.reading(offline)).toMatchObject({ state: 'stopped', clock: '12:00' });
  });

  it('stops projecting once no newer save arrives in time', () => {
    const fake = fakeSource();
    const clock = new WorldClock(fake.source);
    const frame = status();
    clock.observe(frame);
    fake.advance(600_000);
    expect(clock.reading(frame)).toMatchObject({ state: 'stale', clock: '22:00' });
  });

  it('settles a small correction and sweeps a jump', () => {
    const fake = fakeSource();
    const clock = new WorldClock(fake.source);
    clock.observe(status());
    fake.advance(5000);
    const nudged = status({}, { seconds: noon + 7 }, updated + 5000);
    clock.observe(nudged);
    expect(clock.reading(nudged)?.seconds).toBeCloseTo(noon + 65, 3);
    fake.advance(settleMs / 2);
    const midway = clock.reading(nudged)?.seconds ?? 0;
    expect(midway).toBeGreaterThan(noon + 65.3);
    expect(midway).toBeLessThan(noon + 72.3);
    fake.advance(settleMs / 2);
    expect(clock.reading(nudged)?.seconds).toBeCloseTo(noon + 72 + settleMs / 1000, 3);
    const slept = status({}, { seconds: noon + 7 + 600 }, updated + 5000 + settleMs);
    clock.observe(slept);
    expect(clock.easing(fake.time())).toBe(true);
    fake.advance(sweepMs);
    expect(clock.easing(fake.time())).toBe(false);
    expect(clock.reading(slept)?.seconds).toBeCloseTo(noon + 672 + sweepMs / 1000 + 0.6, 3);
  });

  it('snaps instead of easing under reduced motion', () => {
    const fake = fakeSource(true);
    const clock = new WorldClock(fake.source);
    clock.observe(status());
    fake.advance(5000);
    const nudged = status({}, { seconds: noon + 9 }, updated + 5000);
    clock.observe(nudged);
    expect(clock.reading(nudged)?.seconds).toBeCloseTo(noon + 74, 3);
  });

  it('ticks on the in-game minute, on frames while easing, and not at all while hidden', () => {
    const fake = fakeSource();
    const clock = new WorldClock(fake.source);
    const stop = clock.start();
    expect(fake.waits).toHaveLength(1);
    fake.runDue();
    expect(fake.waits.map((entry) => entry.due - fake.time())).toEqual([idleMs]);
    clock.observe(status());
    fake.runDue();
    expect(fake.waits.map((entry) => entry.due - fake.time())).toEqual([1004]);
    fake.advance(1004);
    fake.runDue();
    clock.observe(status({}, { seconds: noon + 20 }, updated + 1004));
    fake.runDue();
    expect(fake.frames).toHaveLength(1);
    expect(fake.waits).toHaveLength(0);
    fake.advance(settleMs);
    fake.runDue();
    expect(fake.frames).toHaveLength(0);
    expect(fake.waits).toHaveLength(1);
    fake.hide(true);
    fake.advance(2000);
    fake.runDue();
    expect(fake.waits).toHaveLength(0);
    fake.hide(false);
    expect(fake.waits).toHaveLength(1);
    stop();
    expect(fake.waits).toHaveLength(0);
  });
});
