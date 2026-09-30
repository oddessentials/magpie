import type { ClockReading, Phase } from '$lib/world/clock';
import { formatNumber } from './format';
import { t } from './strings';

export function phaseLabel(phase: Phase): string {
  return t.clock.phases[phase];
}

export function compactDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return t.time.seconds(total);
  return t.time.minutes(Math.max(1, Math.round(total / 60)));
}

export function clockCountdown(reading: ClockReading): string {
  return t.clock.turn[reading.turn.kind](compactDuration(reading.turn.inSeconds));
}

export function clockNote(reading: ClockReading): string {
  return reading.state === 'live' ? clockCountdown(reading) : t.clock.notes[reading.state];
}

export function stripClock(reading: ClockReading): string {
  return t.clock.strip(formatNumber(reading.day), reading.clock);
}

export function clockLabel(reading: ClockReading | null, note: string): string {
  if (!reading) return t.clock.label(note);
  const day = t.clock.day(formatNumber(reading.day));
  return t.clock.label(`${day}, ${reading.clock}, ${phaseLabel(reading.phase)}, ${note}`);
}
