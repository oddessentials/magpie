import type { Status, StatusClock } from '$lib/api/types';
import facts from './clock.json';

export const daySeconds = facts.realMinutesPerGameDay * 60;
export const minutesPerDay = 24 * 60;
export const dawnMinute = facts.dawnHour * 60;
export const duskMinute = facts.duskHour * 60;
export const ticksPerMinute = 600_000_000;
export const firstMinute = facts.initialTicks / ticksPerMinute;

export type Phase = 'night' | 'morning' | 'afternoon' | 'evening';
export type ClockState = 'live' | 'stopped' | 'stale' | 'lost';

export interface Turn {
  kind: 'dawn' | 'nightfall';
  inSeconds: number;
}

export interface ClockPoint {
  day: number;
  minute: number;
}

export interface ClockReading extends ClockPoint {
  state: ClockState;
  seconds: number;
  clock: string;
  phase: Phase;
  turn: Turn;
}

export function savedClock(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const day = Math.floor(seconds / daySeconds);
  if (day > 2147483647) return null;
  return { day, hour: ((seconds % daySeconds) * 24) / daySeconds };
}

export function clockAt(seconds: number): ClockPoint {
  const day = Math.floor(seconds / daySeconds);
  return { day, minute: ((seconds - day * daySeconds) * minutesPerDay) / daySeconds };
}

export function isNight(minute: number): boolean {
  return minute < dawnMinute || minute >= duskMinute;
}

export function phaseOf(minute: number): Phase {
  if (isNight(minute)) return 'night';
  if (minute < 12 * 60) return 'morning';
  if (minute < 18 * 60) return 'afternoon';
  return 'evening';
}

export function formatClock(minute: number): string {
  const whole = Math.floor(minute) % minutesPerDay;
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export function nextTurn(minute: number, rate = 1): Turn {
  const night = isNight(minute);
  const boundary = !night
    ? duskMinute
    : minute < dawnMinute
      ? dawnMinute
      : minutesPerDay + dawnMinute;
  return {
    kind: night ? 'dawn' : 'nightfall',
    inSeconds: ((boundary - minute) * daySeconds) / minutesPerDay / rate
  };
}

export function runningSince(clock: StatusClock, onlineSince: string | null): number {
  const observed = Date.parse(clock.observed_at);
  const since = onlineSince === null ? NaN : Date.parse(onlineSince);
  return Number.isNaN(since) ? observed : Math.max(observed, since);
}

export function projectedSeconds(clock: StatusClock, onlineSince: string | null, at: number) {
  return clock.seconds + (clock.rate * Math.max(0, at - runningSince(clock, onlineSince))) / 1000;
}

export function clockStateOf(status: Status, at: number): ClockState {
  const clock = status.save.clock;
  if (status.collector.state !== 'active' || status.state === 'unknown') return 'lost';
  if (status.state === 'offline') return 'stopped';
  if (clock && at - runningSince(clock, status.since) > clock.stale_after_s * 1000) return 'stale';
  return 'live';
}

export function readingOf(state: ClockState, seconds: number, rate = 1): ClockReading {
  const point = clockAt(seconds);
  return {
    state,
    seconds,
    ...point,
    clock: formatClock(point.minute),
    phase: phaseOf(point.minute),
    turn: nextTurn(point.minute, rate)
  };
}

export function readClock(status: Status, at: number): ClockReading | null {
  const clock = status.save.clock;
  if (!clock) return null;
  const state = clockStateOf(status, at);
  const staleAt = runningSince(clock, status.since) + clock.stale_after_s * 1000;
  const seconds =
    state === 'live'
      ? projectedSeconds(clock, status.since, at)
      : state === 'stale'
        ? projectedSeconds(clock, status.since, staleAt)
        : clock.seconds;
  return readingOf(state, seconds, clock.rate);
}
