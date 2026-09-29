export function levelFor(curve: readonly number[], xp: number, maxLevel = curve.length): number {
  let level = 1;
  for (let index = 1; index < curve.length; index += 1) {
    if (xp >= curve[index]!) level = index + 1;
    else break;
  }
  return Math.min(level, maxLevel);
}

export function xpFor(curve: readonly number[], level: number): number | null {
  return curve[level - 1] ?? null;
}

export function xpNeeded(curve: readonly number[], xp: number, target: number): number | null {
  const goal = xpFor(curve, target);
  return goal === null ? null : Math.max(0, goal - xp);
}

export function daysAtPace(needed: number, weekly: number): number | null {
  if (needed <= 0) return 0;
  if (weekly <= 0) return null;
  return Math.ceil(needed / (weekly / 7));
}

export function timesFor(needed: number, each: number): number | null {
  if (each <= 0) return null;
  return Math.ceil(needed / each);
}
