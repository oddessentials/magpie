import clock from '$lib/world/clock.json';

export function savedClock(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const daySeconds = clock.realMinutesPerGameDay * 60;
  const day = Math.floor(seconds / daySeconds);
  if (day > 2147483647) return null;
  return { day, hour: ((seconds % daySeconds) * 24) / daySeconds };
}
