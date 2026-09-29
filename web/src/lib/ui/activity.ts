import type { ActivityDetails, ActivityItem, ActivityType, PlayerRef } from '$lib/api/types';
import { formatDuration } from './format';
import { humanize, journalName, t } from './strings';

export type ActivityTone = 'neutral' | 'good' | 'bad' | 'warn' | 'info';

export type ActivityPart =
  | { kind: 'text'; text: string }
  | { kind: 'player'; player: PlayerRef }
  | { kind: 'quote'; text: string };

export interface ActivityView {
  tone: ActivityTone;
  parts: ActivityPart[];
  channel: string | null;
}

export const activityLabels: Record<ActivityType, string> = t.activity.labels;

export const activityFilters: { label: string; types: ActivityType[] }[] = [
  { label: t.activity.filters.presence, types: ['player.joined', 'player.left'] },
  { label: t.activity.filters.deaths, types: ['player.died'] },
  { label: t.activity.filters.discoveries, types: ['journal.unlocked'] },
  { label: t.activity.filters.progress, types: ['skill.level_up', 'quest.updated'] },
  { label: t.activity.filters.chat, types: ['chat.message'] },
  {
    label: t.activity.filters.server,
    types: ['server.online', 'server.stopping', 'server.offline', 'collector.lost', 'player.kicked']
  }
];

const text = (value: string): ActivityPart => ({ kind: 'text', text: value });

function who(player: PlayerRef | null): ActivityPart {
  return player ? { kind: 'player', player } : text(t.activity.someone);
}

export function deathPhrase(details: Pick<ActivityDetails, 'cause' | 'killer'>): string {
  if (details.killer) return t.activity.phrases.slainBy(details.killer);
  if (details.cause) return t.activity.phrases.diedOf(humanize(details.cause));
  return t.activity.phrases.died;
}

function offlinePhrase(reason: string | null | undefined): string {
  switch (reason) {
    case 'stopped':
      return t.activity.phrases.serverStopped;
    case 'crashed':
      return t.activity.phrases.serverCrashed;
    case 'collector_stopping':
      return t.activity.phrases.collectorStopping;
    default:
      return t.activity.phrases.serverUnreachable;
  }
}

export function describeActivity(item: ActivityItem): ActivityView {
  const details = item.details;
  const view = (tone: ActivityTone, parts: ActivityPart[], channel: string | null = null) => ({
    tone,
    parts,
    channel
  });
  switch (item.type) {
    case 'server.online':
      return view('good', [
        text(
          details.version
            ? t.activity.phrases.serverOnlineVersion(details.version)
            : t.activity.phrases.serverOnline
        )
      ]);
    case 'server.stopping':
      return view('warn', [
        text(
          details.by
            ? t.activity.phrases.serverStoppingBy(details.by)
            : t.activity.phrases.serverStopping
        )
      ]);
    case 'server.offline':
      return view('bad', [text(offlinePhrase(details.reason))]);
    case 'collector.lost':
      return view('warn', [text(t.activity.phrases.collectorLost)]);
    case 'player.joined':
      return view('good', [who(item.player), text(t.activity.phrases.joined)]);
    case 'player.left':
      return view('neutral', [
        who(item.player),
        text(
          details.session_s
            ? t.activity.phrases.leftAfter(formatDuration(details.session_s))
            : t.activity.phrases.left
        )
      ]);
    case 'player.died':
      return view('bad', [who(item.player), text(deathPhrase(details))]);
    case 'journal.unlocked':
      return view('info', [
        who(item.player),
        text(t.activity.phrases.discovered(details.entry_name ?? journalName(details.entry ?? '')))
      ]);
    case 'skill.level_up':
      return view('good', [
        who(item.player),
        text(
          t.activity.phrases.levelUp(
            details.level ?? 0,
            details.skill_name ?? humanize(details.skill ?? '')
          )
        )
      ]);
    case 'quest.updated': {
      const quest = details.quest_name ?? humanize(details.quest ?? '');
      return view('info', [
        who(item.player),
        text(
          details.state?.toLowerCase() === 'completed'
            ? t.activity.phrases.questDone(quest)
            : t.activity.phrases.questAdvanced(quest)
        )
      ]);
    }
    case 'chat.message':
      return view(
        'neutral',
        [who(item.player), text(' '), { kind: 'quote', text: details.text ?? '' }],
        t.activity.channels[details.channel ?? 'other']
      );
    case 'player.kicked':
      return view('warn', [
        who(item.player),
        text(details.by ? t.activity.phrases.kickedBy(details.by) : t.activity.phrases.kicked)
      ]);
    default:
      return view('neutral', [text(item.type)]);
  }
}

export function upsertActivity(
  items: ActivityItem[],
  item: ActivityItem,
  limit: number
): ActivityItem[] {
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [item, ...items].slice(0, limit);
  return items.map((entry, at) => (at === index ? item : entry));
}

export function mergeActivity(live: ActivityItem[], loaded: ActivityItem[]): ActivityItem[] {
  const seen = new Set<string>();
  const merged: ActivityItem[] = [];
  for (const item of [...live, ...loaded]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}
