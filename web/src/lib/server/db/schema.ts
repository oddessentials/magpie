import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

const utc = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const meta = pgTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: utc('updated_at').notNull().defaultNow()
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: utc('updated_at').notNull().defaultNow()
});

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey(),
    runId: uuid('run_id').notNull(),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    ts: utc('ts').notNull(),
    receivedAt: utc('received_at').notNull().defaultNow(),
    data: jsonb('data').notNull(),
    source: text('source').notNull().default('collector'),
    invalid: text('invalid'),
    playerId: integer('player_id'),
    quiet: boolean('quiet').notNull().default(false)
  },
  (table) => [
    index('events_ts_seq_idx').on(table.ts, table.seq),
    index('events_type_ts_idx').on(table.type, table.ts),
    index('events_run_seq_idx').on(table.runId, table.seq),
    index('events_player_ts_idx').on(table.playerId, table.ts)
  ]
);

export const serverMetrics = pgTable('server_metrics', {
  ts: utc('ts').primaryKey(),
  memoryMb: doublePrecision('memory_mb').notNull(),
  uptimeS: doublePrecision('uptime_s').notNull(),
  players: integer('players').notNull(),
  maxPlayers: integer('max_players'),
  cpuPercent: doublePrecision('cpu_percent')
});

export const collectorRuns = pgTable(
  'collector_runs',
  {
    runId: uuid('run_id').primaryKey(),
    startedAt: utc('started_at').notNull(),
    lastSeenAt: utc('last_seen_at').notNull(),
    lastSeq: integer('last_seq').notNull().default(0),
    stoppedAt: utc('stopped_at'),
    lostAt: utc('lost_at'),
    collectorName: text('collector_name'),
    collectorVersion: text('collector_version'),
    os: text('os'),
    arch: text('arch'),
    layers: jsonb('layers').$type<Record<string, unknown>>(),
    serverVersion: text('server_version'),
    serverName: text('server_name'),
    worldGuid: text('world_guid'),
    settings: jsonb('settings').$type<Record<string, unknown>>(),
    heartbeat: jsonb('heartbeat').$type<Record<string, unknown>>(),
    heartbeatAt: utc('heartbeat_at')
  },
  (table) => [index('collector_runs_started_idx').on(table.startedAt)]
);

export const serverState = pgTable('server_state', {
  id: integer('id').primaryKey(),
  online: boolean('online').notNull().default(false),
  onlineSince: utc('online_since'),
  offlineSince: utc('offline_since'),
  stoppingAt: utc('stopping_at'),
  serverName: text('server_name'),
  serverVersion: text('server_version'),
  serverBuild: text('server_build'),
  worldName: text('world_name'),
  worldGuid: text('world_guid'),
  maxPlayers: integer('max_players'),
  presenceAt: utc('presence_at'),
  memoryMb: doublePrecision('memory_mb'),
  uptimeS: doublePrecision('uptime_s'),
  cpuPercent: doublePrecision('cpu_percent'),
  metricsAt: utc('metrics_at'),
  saveAt: utc('save_at'),
  saveDay: integer('save_day'),
  updatedAt: utc('updated_at').notNull().defaultNow()
});

export const players = pgTable(
  'players',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    characterGuid: text('character_guid'),
    platform: text('platform').notNull(),
    name: text('name').notNull(),
    nameOverride: text('name_override'),
    hidden: boolean('hidden').notNull().default(false),
    firstSeen: utc('first_seen').notNull(),
    lastSeen: utc('last_seen').notNull(),
    online: boolean('online').notNull().default(false),
    currentSessionId: integer('current_session_id'),
    dead: boolean('dead').notNull().default(false),
    playtimeS: doublePrecision('playtime_s').notNull().default(0),
    sessions: integer('sessions').notNull().default(0),
    deaths: integer('deaths').notNull().default(0),
    chatMessages: integer('chat_messages').notNull().default(0)
  },
  (table) => [
    uniqueIndex('players_user_id_idx').on(table.userId),
    index('players_character_guid_idx').on(table.characterGuid),
    index('players_last_seen_idx').on(table.lastSeen)
  ]
);

export type SessionEndReason = 'left' | 'server_offline' | 'collector_stopped' | 'collector_lost';

export const sessions = pgTable(
  'sessions',
  {
    id: serial('id').primaryKey(),
    playerId: integer('player_id').notNull(),
    runId: uuid('run_id').notNull(),
    joinedAt: utc('joined_at').notNull(),
    leftAt: utc('left_at'),
    durationS: doublePrecision('duration_s'),
    endReason: text('end_reason').$type<SessionEndReason>(),
    source: text('source').notNull(),
    joinEventId: uuid('join_event_id'),
    leftEventId: uuid('left_event_id'),
    deaths: integer('deaths').notNull().default(0)
  },
  (table) => [
    index('sessions_player_joined_idx').on(table.playerId, table.joinedAt),
    index('sessions_open_idx').on(table.leftAt)
  ]
);

export const deaths = pgTable(
  'deaths',
  {
    id: serial('id').primaryKey(),
    eventId: uuid('event_id').notNull(),
    playerId: integer('player_id').notNull(),
    at: utc('at').notNull(),
    x: doublePrecision('x'),
    y: doublePrecision('y'),
    z: doublePrecision('z'),
    source: text('source').notNull(),
    cause: text('cause'),
    killer: text('killer'),
    mergedEventId: uuid('merged_event_id')
  },
  (table) => [
    uniqueIndex('deaths_event_idx').on(table.eventId),
    index('deaths_player_at_idx').on(table.playerId, table.at),
    index('deaths_at_idx').on(table.at)
  ]
);

export const journalEntries = pgTable(
  'journal_entries',
  {
    playerId: integer('player_id').notNull(),
    entry: text('entry').notNull(),
    eventId: uuid('event_id').notNull(),
    at: utc('at').notNull()
  },
  (table) => [
    primaryKey({ columns: [table.playerId, table.entry] }),
    index('journal_entries_at_idx').on(table.at)
  ]
);

export const levelUps = pgTable(
  'level_ups',
  {
    id: serial('id').primaryKey(),
    eventId: uuid('event_id').notNull(),
    playerId: integer('player_id').notNull(),
    at: utc('at').notNull(),
    skill: text('skill').notNull(),
    level: integer('level').notNull()
  },
  (table) => [
    uniqueIndex('level_ups_event_idx').on(table.eventId),
    index('level_ups_player_at_idx').on(table.playerId, table.at)
  ]
);

export const feats = pgTable(
  'feats',
  {
    id: serial('id').primaryKey(),
    eventId: uuid('event_id').notNull(),
    playerId: integer('player_id').notNull(),
    at: utc('at').notNull(),
    kind: text('kind').notNull(),
    subject: text('subject').notNull(),
    detail: text('detail')
  },
  (table) => [
    uniqueIndex('feats_event_idx').on(table.eventId),
    index('feats_player_kind_idx').on(table.playerId, table.kind),
    index('feats_at_idx').on(table.at)
  ]
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: serial('id').primaryKey(),
    eventId: uuid('event_id').notNull(),
    at: utc('at').notNull(),
    playerId: integer('player_id'),
    name: text('name').notNull(),
    channel: text('channel').notNull(),
    text: text('text').notNull()
  },
  (table) => [
    uniqueIndex('chat_messages_event_idx').on(table.eventId),
    index('chat_messages_at_idx').on(table.at)
  ]
);

export interface SavedSkill {
  id: string;
  xp: number;
}

export interface SavedQuest {
  id: string;
  state: string;
  objective: string | null;
}

export const characterSaves = pgTable(
  'character_saves',
  {
    characterGuid: text('character_guid').primaryKey(),
    savedAt: utc('saved_at').notNull(),
    userId: text('user_id'),
    name: text('name').notNull(),
    playtimeS: doublePrecision('playtime_s'),
    health: doublePrecision('health'),
    maxHealth: doublePrecision('max_health'),
    skills: jsonb('skills').$type<SavedSkill[]>().notNull(),
    quests: jsonb('quests').$type<SavedQuest[]>().notNull(),
    journalUnlocked: integer('journal_unlocked'),
    journalUnread: integer('journal_unread'),
    spells: integer('spells'),
    regionsRevealed: integer('regions_revealed'),
    goneAt: utc('gone_at')
  },
  (table) => [index('character_saves_user_idx').on(table.userId)]
);

export interface SavedWeather {
  region: string;
  type: string;
  day_count: number | null;
  remaining_s: number | null;
}

export interface SavedWorldEvent {
  id: string;
  name: string | null;
  state: string | null;
}

export const worldSaves = pgTable('world_saves', {
  savedAt: utc('saved_at').primaryKey(),
  worldGuid: text('world_guid').notNull(),
  worldName: text('world_name'),
  day: integer('day'),
  timeOfDay: doublePrecision('time_of_day'),
  weather: jsonb('weather').$type<SavedWeather[]>().notNull(),
  events: jsonb('events').$type<SavedWorldEvent[]>().notNull(),
  hardcore: boolean('hardcore'),
  friendlyFire: boolean('friendly_fire'),
  difficulty: text('difficulty'),
  sizeBytes: integer('size_bytes')
});

export type ServerStatusState = 'online' | 'offline' | 'unknown';

export const statusSamples = pgTable('status_samples', {
  ts: utc('ts').primaryKey(),
  state: text('state').$type<ServerStatusState>().notNull(),
  players: integer('players').notNull(),
  memoryMb: doublePrecision('memory_mb')
});

export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  kind: text('kind').notNull(),
  state: text('state').notNull().default('queued'),
  createdAt: utc('created_at').notNull().defaultNow(),
  startedAt: utc('started_at'),
  finishedAt: utc('finished_at'),
  progress: doublePrecision('progress'),
  error: text('error')
});

export const backups = pgTable('backups', {
  id: serial('id').primaryKey(),
  at: utc('at').notNull().defaultNow(),
  file: text('file').notNull(),
  sizeBytes: doublePrecision('size_bytes').notNull().default(0),
  ok: boolean('ok').notNull(),
  error: text('error')
});

export const ingestBatches = pgTable(
  'ingest_batches',
  {
    id: serial('id').primaryKey(),
    receivedAt: utc('received_at').notNull().defaultNow(),
    status: integer('status').notNull(),
    accepted: integer('accepted').notNull().default(0),
    duplicates: integer('duplicates').notNull().default(0),
    invalid: integer('invalid').notNull().default(0),
    events: integer('events').notNull().default(0)
  },
  (table) => [index('ingest_batches_received_idx').on(table.receivedAt)]
);

export const adminSessions = pgTable('admin_sessions', {
  id: text('id').primaryKey(),
  createdAt: utc('created_at').notNull().defaultNow(),
  expiresAt: utc('expires_at').notNull()
});

export type EventRow = typeof events.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type ServerStateRow = typeof serverState.$inferSelect;
export type CollectorRunRow = typeof collectorRuns.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type DeathRow = typeof deaths.$inferSelect;
export type CharacterSaveRow = typeof characterSaves.$inferSelect;
export type WorldSaveRow = typeof worldSaves.$inferSelect;

export const projectionTables = [
  sessions,
  deaths,
  journalEntries,
  levelUps,
  feats,
  chatMessages,
  characterSaves,
  worldSaves
] as const;
