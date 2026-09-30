import { browser } from '$app/environment';
import type { Status } from '$lib/api/types';
import {
  daySeconds,
  minutesPerDay,
  readClock,
  readingOf,
  type ClockReading
} from '$lib/world/clock';

export const settleMs = 600;
export const sweepMs = 1200;
export const smallCorrectionSeconds = 60;
export const idleMs = 30_000;

export interface TimeSource {
  now(): number;
  hidden(): boolean;
  frame(callback: () => void): () => void;
  wait(callback: () => void, ms: number): () => void;
  onVisible(callback: () => void): () => void;
  reducedMotion(): boolean;
}

const browserSource: TimeSource = {
  now: () => performance.now(),
  hidden: () => document.hidden,
  frame: (callback) => {
    const handle = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(handle);
  },
  wait: (callback, ms) => {
    const handle = setTimeout(callback, ms);
    return () => clearTimeout(handle);
  },
  onVisible: (callback) => {
    const listener = () => {
      if (!document.hidden) callback();
    };
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
  reducedMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches
};

interface Anchor {
  key: string;
  status: Status;
  site: number;
  at: number;
}

function keyOf(status: Status): string {
  const clock = status.save.clock;
  return [
    clock?.seconds,
    clock?.observed_at,
    clock?.rate,
    clock?.stale_after_s,
    status.state,
    status.since,
    status.collector.state,
    status.updated_at
  ].join('|');
}

function easeOut(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

export class WorldClock {
  #source: TimeSource | null;
  #anchor: Anchor | null = null;
  #correction = 0;
  #correctionAt = 0;
  #correctionMs = 0;
  #tick = $state(0);
  #cancel: (() => void) | null = null;
  #loop: (() => void) | null = null;

  constructor(source: TimeSource | null = browser ? browserSource : null) {
    this.#source = source;
  }

  easing(now: number): boolean {
    return this.#correctionMs > 0 && now - this.#correctionAt < this.#correctionMs;
  }

  #target(now: number): ClockReading | null {
    const anchor = this.#anchor;
    return anchor ? readClock(anchor.status, anchor.site + (now - anchor.at)) : null;
  }

  #shown(now: number): number | null {
    const target = this.#target(now);
    if (!target) return null;
    if (!this.easing(now)) return target.seconds;
    const progress = (now - this.#correctionAt) / this.#correctionMs;
    return target.seconds - this.#correction * (1 - easeOut(progress));
  }

  delay(now: number): number {
    const target = this.#target(now);
    if (!target || target.state !== 'live') return idleMs;
    const rate = this.#anchor?.status.save.clock?.rate ?? 1;
    const minuteMs = (daySeconds / minutesPerDay / rate) * 1000;
    const into = target.minute - Math.floor(target.minute);
    return Math.max(16, Math.ceil((1 - into) * minuteMs) + 4);
  }

  start(): () => void {
    const source = this.#source;
    if (!source) return () => {};
    let stopped = false;
    const loop = () => {
      this.#cancel = null;
      if (stopped || source.hidden()) return;
      this.#tick += 1;
      const now = source.now();
      this.#cancel = this.easing(now) ? source.frame(loop) : source.wait(loop, this.delay(now));
    };
    this.#loop = loop;
    const offVisible = source.onVisible(() => {
      if (this.#cancel === null && !stopped) this.#cancel = source.wait(loop, 0);
    });
    this.#cancel = source.wait(loop, 0);
    return () => {
      stopped = true;
      this.#loop = null;
      offVisible();
      this.#cancel?.();
      this.#cancel = null;
    };
  }

  #kick(): void {
    const source = this.#source;
    const loop = this.#loop;
    if (!source || !loop) return;
    this.#cancel?.();
    this.#cancel = source.wait(loop, 0);
  }

  observe(status: Status | null): void {
    const source = this.#source;
    if (!source) return;
    if (!status?.save.clock) {
      this.#anchor = null;
      this.#correctionMs = 0;
      return;
    }
    const key = keyOf(status);
    if (this.#anchor?.key === key) return;
    const now = source.now();
    const shown = this.#shown(now);
    this.#anchor = { key, status, site: Date.parse(status.updated_at), at: now };
    this.#kick();
    const target = this.#target(now);
    if (shown === null || !target) return;
    const delta = target.seconds - shown;
    if (Math.abs(delta) < daySeconds / minutesPerDay || source.reducedMotion()) {
      this.#correctionMs = 0;
      return;
    }
    this.#correction = delta;
    this.#correctionAt = now;
    this.#correctionMs = Math.abs(delta) < smallCorrectionSeconds ? settleMs : sweepMs;
  }

  reading(status: Status | null): ClockReading | null {
    if (!status?.save.clock) return null;
    const settled = readClock(status, Date.parse(status.updated_at));
    const source = this.#source;
    if (!source) return settled;
    void this.#tick;
    const anchor = this.#anchor;
    if (!anchor || anchor.key !== keyOf(status)) return settled;
    const now = source.now();
    const target = this.#target(now);
    if (!target || !this.easing(now)) return target;
    const progress = (now - this.#correctionAt) / this.#correctionMs;
    const seconds = target.seconds - this.#correction * (1 - easeOut(progress));
    return readingOf(target.state, seconds, status.save.clock.rate);
  }
}

export const worldClock = new WorldClock();
