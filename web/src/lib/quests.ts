const completedStates = new Set(['completed', 'complete', '2']);

export function isQuestComplete(state: string | null | undefined): boolean {
  return typeof state === 'string' && completedStates.has(state.trim().toLowerCase());
}
