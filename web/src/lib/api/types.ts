export interface paths {
  '/api/ingest': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['ingestBatch'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/activity': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listActivity'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/backups': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listBackups'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/backups/run': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['runBackup'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/collector': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAdminCollector'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/collector/secret': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['regenerateCollectorSecret'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/events': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAdminEvents'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAdminHealth'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/jobs/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getJob'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/login': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['adminLogin'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/logout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['adminLogout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/players': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAdminPlayers'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/players/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations['updateAdminPlayer'];
    trace?: never;
  };
  '/api/v1/admin/projections/rebuild': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['rebuildProjections'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/session': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAdminSession'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/settings': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAdminSettings'];
    put: operations['updateAdminSettings'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/setup': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['adminSetup'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/chat': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listChat'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getHealth'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/online': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getOnline'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/openapi.json': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getOpenApi'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/players': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listPlayers'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/players/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getPlayer'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/players/{id}/sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listPlayerSessions'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/site': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getSite'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/status': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getStatus'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/status/history': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getStatusHistory'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/stream': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['streamEvents'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/world': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getWorld'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    ActivityDetails: {
      by?: string | null;
      cause?: string | null;
      channel?: components['schemas']['ChatChannel'];
      entry?: string;
      entry_name?: string | null;
      killer?: string | null;
      last_seen_at?: string;
      level?: number;
      objective?: string | null;
      quest?: string;
      quest_name?: string | null;
      reason?: string | null;
      session_s?: number | null;
      skill?: string;
      skill_name?: string | null;
      state?: string;
      text?: string;
      version?: string | null;
    };
    ActivityItem: {
      details: components['schemas']['ActivityDetails'];
      id: components['schemas']['Uuid'];
      player: components['schemas']['PlayerRef'] | null;
      ts: string;
      type: components['schemas']['ActivityType'];
    };
    ActivityPage: {
      items: components['schemas']['ActivityItem'][];
      next_cursor: string | null;
    };
    ActivityType:
      | 'server.online'
      | 'server.stopping'
      | 'server.offline'
      | 'collector.lost'
      | 'player.joined'
      | 'player.left'
      | 'player.died'
      | 'journal.unlocked'
      | 'skill.level_up'
      | 'quest.updated'
      | 'chat.message'
      | 'player.kicked';
    AdminActionData: {
      action: string;
      character_guid: components['schemas']['CharacterGuid'];
      name: string;
      target?: string | null;
      user_id: components['schemas']['UserId'] | null;
    } & {
      [key: string]: unknown;
    };
    AdminActionEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['AdminActionData'];
      type: 'admin.action';
    };
    AdminEvent: {
      data: {
        [key: string]: unknown;
      };
      id: components['schemas']['Uuid'];
      invalid: string | null;
      player: components['schemas']['PlayerRef'] | null;
      quiet: boolean;
      received_at: string;
      run_id: components['schemas']['Uuid'];
      seq: number;
      source: 'collector' | 'site';
      ts: string;
      type: string;
    };
    AdminHealth: {
      backup: components['schemas']['AdminHealthBackup'];
      collector: components['schemas']['AdminHealthCollector'];
      db: components['schemas']['AdminHealthDb'];
      ingest: components['schemas']['IngestCounters'];
      jobs: components['schemas']['AdminHealthJob'][];
    };
    AdminHealthBackup: {
      kept: number;
      last_at: string | null;
      size_mb: number | null;
    };
    AdminHealthCollector: {
      dropped_events: number | null;
      heartbeat_age_s: number | null;
      logs: string | null;
      mod: string | null;
      process: string | null;
      queue_depth: number | null;
      run: components['schemas']['CollectorRun'] | null;
      saves: string | null;
      state: 'active' | 'stopped' | 'lost' | 'none';
    };
    AdminHealthDb: {
      events_total: number;
      size_mb: number;
    };
    AdminHealthJob: {
      last_error: string | null;
      last_ok: boolean | null;
      last_run_at: string | null;
      name: string;
    };
    AdminPlayer: {
      character_guid: components['schemas']['CharacterGuid'];
      first_seen: string;
      game_name: string;
      hidden: boolean;
      id: number;
      last_seen: string;
      name: string;
      name_override: string | null;
      online: boolean;
      platform: components['schemas']['Platform'];
      playtime_s: number;
      sessions: number;
      user_id: components['schemas']['UserId'];
    };
    AdminPlayerPage: {
      items: components['schemas']['AdminPlayer'][];
      next_cursor: string | null;
    };
    AdminSession: {
      authenticated: boolean;
      expires_at: string | null;
      setup_required: boolean;
    };
    AdminSettings: {
      features: components['schemas']['SiteFeatures'];
      locked: 'site_name'[];
      retention: components['schemas']['Retention'];
      site_name: string;
    };
    AdminSettingsUpdate: {
      features?: {
        chat?: boolean;
      };
      retention?: {
        metrics_days?: number;
        status_samples_days?: number;
        world_saves_days?: number;
      };
      site_name?: string;
    };
    Backup: {
      at: string;
      file: string;
      ok: boolean;
      size_bytes: number;
    };
    BackupList: {
      items: components['schemas']['Backup'][];
    };
    BuildingPlacedData: {
      building: string;
      character_guid: components['schemas']['CharacterGuid'];
      name: string;
      user_id: components['schemas']['UserId'] | null;
    } & {
      [key: string]: unknown;
    };
    BuildingPlacedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['BuildingPlacedData'];
      type: 'building.placed';
    };
    CharacterGuid: string | null;
    ChatChannel: 'global' | 'direct' | 'other';
    ChatItem: {
      channel: components['schemas']['ChatChannel'];
      id: components['schemas']['Uuid'];
      name: string;
      player: components['schemas']['PlayerRef'] | null;
      text: string;
      ts: string;
    };
    ChatMessageData: {
      channel: string;
      character_guid: components['schemas']['CharacterGuid'];
      name: string;
      recipients?: number | null;
      text: string;
      user_id: components['schemas']['UserId'] | null;
    } & {
      [key: string]: unknown;
    };
    ChatMessageEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['ChatMessageData'];
      type: 'chat.message';
    };
    ChatPage: {
      items: components['schemas']['ChatItem'][];
      next_cursor: string | null;
    };
    CollectorAction: {
      id: number;
      kind: string;
      message: string | null;
    } & {
      [key: string]: unknown;
    };
    CollectorAdmin: {
      ingest: components['schemas']['IngestCounters'];
      runs: components['schemas']['CollectorRun'][];
      secret: string;
      secret_from_environment: boolean;
      site_version: string;
    };
    CollectorEvent:
      | components['schemas']['CollectorStartedEvent']
      | components['schemas']['CollectorHeartbeatEvent']
      | components['schemas']['ServerOnlineEvent']
      | components['schemas']['ServerStoppingEvent']
      | components['schemas']['ServerOfflineEvent']
      | components['schemas']['ServerSavedEvent']
      | components['schemas']['ServerMetricsEvent']
      | components['schemas']['PlayerJoinedEvent']
      | components['schemas']['PlayerLeftEvent']
      | components['schemas']['PlayerDiedEvent']
      | components['schemas']['PlayerRespawnedEvent']
      | components['schemas']['JournalUnlockedEvent']
      | components['schemas']['SaveWorldEvent']
      | components['schemas']['SavePlayerEvent']
      | components['schemas']['SaveReadEvent']
      | components['schemas']['LogOtherEvent']
      | components['schemas']['ChatMessageEvent']
      | components['schemas']['PlayerEventEvent']
      | components['schemas']['PlayerXpEvent']
      | components['schemas']['SkillLevelUpEvent']
      | components['schemas']['QuestUpdatedEvent']
      | components['schemas']['BuildingPlacedEvent']
      | components['schemas']['ItemCraftedEvent']
      | components['schemas']['AdminActionEvent']
      | components['schemas']['PlayerKickedEvent']
      | components['schemas']['OtherEvent'];
    CollectorHeartbeatData: {
      dropped_events: number;
      logs: 'ok' | 'off' | 'idle' | 'error';
      mod: 'ok' | 'waiting' | 'off';
      process: 'ok' | 'off' | 'unavailable';
      queue_depth: number;
      saves: 'ok' | 'waiting' | 'off' | 'error';
      uptime_s: number;
    } & {
      [key: string]: unknown;
    };
    CollectorHeartbeatEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['CollectorHeartbeatData'];
      type: 'collector.heartbeat';
    };
    CollectorInfo: {
      arch?: string;
      name: string;
      os?: string;
      run_id: components['schemas']['Uuid'];
      version: string;
    } & {
      [key: string]: unknown;
    };
    CollectorLayers: {
      logs: boolean;
      logs_source: 'launch' | 'file' | 'stdin' | 'docker' | null;
      mod: boolean;
      process: boolean;
      saves: boolean;
    } & {
      [key: string]: unknown;
    };
    CollectorLayersSummary: {
      logs: boolean;
      mod: boolean;
      process: boolean;
      saves: boolean;
    };
    CollectorRun: {
      arch: string | null;
      heartbeat: {
        [key: string]: unknown;
      } | null;
      heartbeat_at: string | null;
      last_seen_at: string;
      last_seq: number;
      layers: {
        [key: string]: unknown;
      } | null;
      lost_at: string | null;
      name: string | null;
      os: string | null;
      run_id: components['schemas']['Uuid'];
      server_version: string | null;
      started_at: string;
      stopped_at: string | null;
      version: string | null;
      world_guid: string | null;
    };
    CollectorSecret: {
      secret: string;
    };
    CollectorStartedData: {
      arch: string;
      collector_version: string;
      layers: components['schemas']['CollectorLayers'];
      os: string;
      server: components['schemas']['ServerInfo'] | null;
      settings: components['schemas']['ServerSettings'] | null;
    } & {
      [key: string]: unknown;
    };
    CollectorStartedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['CollectorStartedData'];
      type: 'collector.started';
    };
    CurrentSession: {
      id: number;
      joined_at: string;
    };
    Death: {
      at: string;
      cause: string | null;
      killer: string | null;
      source: 'log' | 'mod';
    };
    Error: {
      error: {
        code:
          | 'bad_request'
          | 'unauthorized'
          | 'forbidden'
          | 'not_found'
          | 'conflict'
          | 'payload_too_large'
          | 'unprocessable'
          | 'rate_limited'
          | 'unavailable'
          | 'not_implemented';
        message: string;
      };
    };
    EventEnvelope: {
      data: Record<string, never>;
      id: components['schemas']['Uuid'];
      player?: components['schemas']['EventPlayer'] | null;
      run_id: components['schemas']['Uuid'];
      seq: number;
      ts: string;
      type: string;
      v?: number;
    } & {
      [key: string]: unknown;
    };
    EventPage: {
      items: components['schemas']['AdminEvent'][];
      next_cursor: string | null;
    };
    EventPlayer: {
      name: string;
      platform?: string | null;
    } & {
      [key: string]: unknown;
    };
    Health: {
      db: boolean;
      mock: boolean;
      ok: boolean;
      version: string;
    };
    IngestBatch: {
      collector: components['schemas']['CollectorInfo'];
      events: components['schemas']['CollectorEvent'][];
      server: components['schemas']['ServerInfo'] | null;
    } & {
      [key: string]: unknown;
    };
    IngestCounters: {
      batches_24h: number;
      duplicates_24h: number;
      events_24h: number;
      invalid_24h: number;
      last_batch_at: string | null;
      rejected_24h: number;
    };
    IngestResult: {
      accepted: number;
      actions: components['schemas']['CollectorAction'][];
      duplicates: number;
      invalid: number;
      last_seq: number | null;
    } & {
      [key: string]: unknown;
    };
    ItemCraftedData: {
      character_guid: components['schemas']['CharacterGuid'];
      count?: number | null;
      name: string;
      recipe: string;
      user_id: components['schemas']['UserId'] | null;
    } & {
      [key: string]: unknown;
    };
    ItemCraftedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['ItemCraftedData'];
      type: 'item.crafted';
    };
    Job: {
      error: string | null;
      finished_at: string | null;
      id: number;
      kind: 'projections_rebuild' | 'backup';
      progress: number | null;
      started_at: string | null;
      state: 'queued' | 'running' | 'done' | 'failed';
    };
    JobAccepted: {
      job_id: number;
    };
    JournalUnlockedData: {
      character_guid: components['schemas']['CharacterGuid'];
      entry: string;
      name: string | null;
      user_id: components['schemas']['UserId'] | null;
    } & {
      [key: string]: unknown;
    };
    JournalUnlockedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['JournalUnlockedData'];
      type: 'journal.unlocked';
    };
    LoginRequest: {
      password: string;
    };
    LogOtherData: {
      category: string;
      level: string | null;
      message: string;
    } & {
      [key: string]: unknown;
    };
    LogOtherEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['LogOtherData'];
      type: 'log.other';
    };
    OnlineList: {
      observed_at: string | null;
      players: components['schemas']['OnlinePlayer'][];
      updated_at: string;
    };
    OnlinePlayer: {
      down: boolean;
      id: number;
      joined_at: string;
      name: string;
      platform: components['schemas']['Platform'];
    };
    OtherEvent: components['schemas']['EventEnvelope'] & {
      type: string;
    };
    Platform: string;
    Player: {
      character: components['schemas']['PlayerCharacter'] | null;
      chat_messages: number | null;
      current_session: components['schemas']['CurrentSession'] | null;
      deaths: number;
      feats: components['schemas']['PlayerFeats'] | null;
      first_seen: string;
      id: number;
      last_seen: string;
      name: string;
      online: boolean;
      platform: components['schemas']['Platform'];
      playtime_s: number;
      recent_deaths: components['schemas']['Death'][];
      recent_sessions: components['schemas']['Session'][];
      sessions: number;
    };
    PlayerCharacter: {
      health: components['schemas']['PlayerHealth'] | null;
      journal: components['schemas']['PlayerJournal'];
      playtime_s: number | null;
      quests: components['schemas']['PlayerQuests'];
      regions_revealed: number | null;
      saved_at: string;
      skills: components['schemas']['PlayerSkill'][];
      spells: number | null;
      total_level: number | null;
    };
    PlayerDiedData: {
      cause?: string | null;
      character_guid: components['schemas']['CharacterGuid'];
      killer?: string | null;
      name: string;
      source: 'log' | 'mod';
      user_id: components['schemas']['UserId'] | null;
      x?: number | null;
      y?: number | null;
      z?: number | null;
    } & {
      [key: string]: unknown;
    };
    PlayerDiedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerDiedData'];
      type: 'player.died';
    };
    PlayerEventData: {
      character_guid: components['schemas']['CharacterGuid'];
      name: string;
      tag: string;
      user_id: components['schemas']['UserId'] | null;
    } & {
      [key: string]: unknown;
    };
    PlayerEventEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerEventData'];
      type: 'player.event';
    };
    PlayerFeats: {
      buildings: number;
      crafts: number;
      journal_entries: number;
      level_ups: number;
      quests_completed: number;
    };
    PlayerHealth: {
      current: number;
      max: number;
    };
    PlayerJoinedData: {
      character_guid: components['schemas']['CharacterGuid'];
      name: string;
      platform: string | null;
      source: 'log';
      user_id: components['schemas']['UserId'];
    } & {
      [key: string]: unknown;
    };
    PlayerJoinedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerJoinedData'];
      type: 'player.joined';
    };
    PlayerJournal: {
      unlocked: number;
      unread: number;
    };
    PlayerKickedData: {
      by?: string | null;
      character_guid: components['schemas']['CharacterGuid'];
      name: string | null;
      reason?: string | null;
      user_id: components['schemas']['UserId'] | null;
    } & {
      [key: string]: unknown;
    };
    PlayerKickedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerKickedData'];
      type: 'player.kicked';
    };
    PlayerLeftData: {
      character_guid: components['schemas']['CharacterGuid'];
      name: string;
      saved: boolean | null;
      source: 'log';
      user_id: components['schemas']['UserId'];
    } & {
      [key: string]: unknown;
    };
    PlayerLeftEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerLeftData'];
      type: 'player.left';
    };
    PlayerPage: {
      items: components['schemas']['PlayerSummary'][];
      next_cursor: string | null;
    };
    PlayerPatch: {
      hidden?: boolean;
      name_override?: string | null;
    };
    PlayerQuests: {
      active: number;
      completed: number;
    };
    PlayerRef: {
      id: number;
      name: string;
    };
    PlayerRespawnedData: {
      character_guid: components['schemas']['CharacterGuid'];
      name: string;
      user_id: components['schemas']['UserId'] | null;
      x?: number | null;
      y?: number | null;
      z?: number | null;
    } & {
      [key: string]: unknown;
    };
    PlayerRespawnedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerRespawnedData'];
      type: 'player.respawned';
    };
    PlayerSkill: {
      id: string;
      level: number | null;
      level_xp: number | null;
      name: string | null;
      next_level_xp: number | null;
      xp: number;
    };
    PlayerSummary: {
      deaths: number;
      first_seen: string;
      id: number;
      last_seen: string;
      name: string;
      online: boolean;
      platform: components['schemas']['Platform'];
      playtime_s: number;
      sessions: number;
    };
    PlayerXpData: {
      character_guid: components['schemas']['CharacterGuid'];
      delta?: number | null;
      name: string;
      skill: string;
      user_id: components['schemas']['UserId'] | null;
      xp: number;
    } & {
      [key: string]: unknown;
    };
    PlayerXpEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerXpData'];
      type: 'player.xp';
    };
    QuestUpdatedData: {
      character_guid: components['schemas']['CharacterGuid'];
      name: string;
      objective?: string | null;
      quest: string;
      state: string;
      user_id: components['schemas']['UserId'] | null;
    } & {
      [key: string]: unknown;
    };
    QuestUpdatedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['QuestUpdatedData'];
      type: 'quest.updated';
    };
    Retention: {
      metrics_days: number;
      status_samples_days: number;
      world_saves_days: number;
    };
    SavePlayerData: {
      character_guid: string;
      health?: components['schemas']['PlayerHealth'] | null;
      journal_unlocked?: number | null;
      journal_unread?: number | null;
      name: string;
      playtime_s?: number | null;
      quests: components['schemas']['SaveQuest'][];
      regions_revealed?: number | null;
      saved_at: string;
      skills: components['schemas']['SaveSkill'][];
      spells?: number | null;
      user_id: components['schemas']['UserId'] | null;
    } & {
      [key: string]: unknown;
    };
    SavePlayerEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['SavePlayerData'];
      type: 'save.player';
    };
    SaveQuest: {
      id: string;
      objective?: string | null;
      state: string;
    } & {
      [key: string]: unknown;
    };
    SaveReadData: {
      character_guids: string[];
      saved_at: string;
      world_guid: string;
    } & {
      [key: string]: unknown;
    };
    SaveReadEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['SaveReadData'];
      type: 'save.read';
    };
    SaveSkill: {
      id: string;
      xp: number;
    } & {
      [key: string]: unknown;
    };
    SaveWeather: {
      day_count?: number | null;
      region: string;
      remaining_s?: number | null;
      type: string;
    } & {
      [key: string]: unknown;
    };
    SaveWorldData: {
      day?: number | null;
      difficulty?: string | null;
      events?: components['schemas']['SaveWorldTrigger'][];
      friendly_fire?: boolean | null;
      hardcore?: boolean | null;
      last_saved_by?: string | null;
      saved_at: string;
      size_bytes?: number | null;
      time_of_day?: number | null;
      weather?: components['schemas']['SaveWeather'][];
      world_guid: string;
      world_name?: string | null;
    } & {
      [key: string]: unknown;
    };
    SaveWorldEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['SaveWorldData'];
      type: 'save.world';
    };
    SaveWorldTrigger: {
      id: string;
      name?: string | null;
      state?: string | null;
    } & {
      [key: string]: unknown;
    };
    ServerInfo: {
      build?: string | null;
      max_players?: number | null;
      name: string;
      version?: string | null;
      world_guid?: string | null;
      world_name: string;
    } & {
      [key: string]: unknown;
    };
    ServerMetricsData: {
      cpu_percent?: number | null;
      max_players?: number | null;
      memory_mb: number;
      players: number;
      uptime_s: number;
    } & {
      [key: string]: unknown;
    };
    ServerMetricsEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['ServerMetricsData'];
      type: 'server.metrics';
    };
    ServerOfflineData: {
      reason: 'stopped' | 'crashed' | 'unreachable' | 'collector_stopping';
    } & {
      [key: string]: unknown;
    };
    ServerOfflineEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['ServerOfflineData'];
      type: 'server.offline';
    };
    ServerOnlineData: components['schemas']['ServerInfo'] & {
      settings?: components['schemas']['ServerSettings'] | null;
    };
    ServerOnlineEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['ServerOnlineData'];
      type: 'server.online';
    };
    ServerSavedData: {
      ok: boolean;
      slot: string | null;
    } & {
      [key: string]: unknown;
    };
    ServerSavedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['ServerSavedData'];
      type: 'server.saved';
    };
    ServerSettings: {
      max_players?: number | null;
      platform_policy?: string | null;
      save_frequency_min?: number | null;
    } & {
      [key: string]: unknown;
    };
    ServerStoppingData: {
      by: string | null;
      save: 'requested' | 'done' | 'failed' | null;
    } & {
      [key: string]: unknown;
    };
    ServerStoppingEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['ServerStoppingData'];
      type: 'server.stopping';
    };
    Session: {
      deaths: number;
      duration_s: number | null;
      end_reason: components['schemas']['SessionEndReason'] | null;
      id: number;
      joined_at: string;
      left_at: string | null;
    };
    SessionEndReason: 'left' | 'server_offline' | 'collector_stopped' | 'collector_lost';
    SessionPage: {
      items: components['schemas']['Session'][];
      next_cursor: string | null;
    };
    SetupRequest: {
      password: string;
    };
    Site: {
      features: components['schemas']['SiteFeatures'];
      name: string;
      version: string;
    };
    SiteFeatures: {
      chat: boolean;
    };
    SkillLevelUpData: {
      character_guid: components['schemas']['CharacterGuid'];
      level: number;
      name: string;
      skill: string;
      user_id: components['schemas']['UserId'] | null;
    } & {
      [key: string]: unknown;
    };
    SkillLevelUpEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['SkillLevelUpData'];
      type: 'skill.level_up';
    };
    Status: {
      collector: components['schemas']['StatusCollector'];
      players: components['schemas']['StatusPlayers'];
      process: components['schemas']['StatusProcess'];
      save: components['schemas']['StatusSave'];
      server: components['schemas']['StatusServer'];
      since: string | null;
      state: components['schemas']['StatusState'];
      stopping: boolean;
      updated_at: string;
    };
    StatusCollector: {
      last_seen_at: string | null;
      layers: components['schemas']['CollectorLayersSummary'] | null;
      state: 'active' | 'stopped' | 'lost' | 'none';
      version: string | null;
    };
    StatusHistory: {
      bucket_s: number;
      points: components['schemas']['StatusHistoryPoint'][];
      range: '24h' | '7d' | '30d';
    };
    StatusHistoryPoint: {
      memory_mb_avg: number | null;
      players_avg: number;
      players_max: number;
      state: components['schemas']['StatusState'];
      ts: string;
    };
    StatusPlayers: {
      max: number | null;
      observed_at: string | null;
      online: number;
    };
    StatusProcess: {
      cpu_percent: number | null;
      measured_at: string | null;
      memory_mb: number | null;
      uptime_s: number | null;
    };
    StatusSave: {
      day: number | null;
      saved_at: string | null;
    };
    StatusServer: {
      name: string | null;
      version: string | null;
      world_name: string | null;
    };
    StatusState: 'online' | 'offline' | 'unknown';
    StreamFrame: {
      data:
        | components['schemas']['Status']
        | components['schemas']['OnlineList']
        | components['schemas']['ActivityItem'];
      event: 'status' | 'online' | 'activity';
      id: string | null;
    };
    UserId: string;
    Uuid: string;
    World: {
      max_players: number | null;
      name: string | null;
      save: components['schemas']['WorldSave'] | null;
      totals: components['schemas']['WorldTotals'];
      tracking_since: string | null;
      version: string | null;
      world_name: string | null;
    };
    WorldEvent: {
      id: string;
      name: string | null;
      state: string | null;
    };
    WorldSave: {
      day: number | null;
      difficulty: string | null;
      events: components['schemas']['WorldEvent'][];
      friendly_fire: boolean | null;
      hardcore: boolean | null;
      saved_at: string;
      size_bytes: number | null;
      time_of_day: number | null;
      weather: components['schemas']['WorldWeather'][];
    };
    WorldTotals: {
      deaths: number;
      journal_entries: number;
      level_ups: number;
      players: number;
      playtime_s: number;
      quests_completed: number;
      sessions: number;
    };
    WorldWeather: {
      day_count: number | null;
      region: string;
      remaining_s: number | null;
      type: string;
    };
  };
  responses: {
    BadRequest: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    Conflict: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    Forbidden: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    NotFound: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    RateLimited: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    Unauthorized: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    Unavailable: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
  };
  parameters: {
    Cursor: string;
    JobId: number;
    LastEventId: string;
    Limit: number;
    MagpieSignature: string;
    MagpieTimestamp: number;
    PlayerFilter: number;
    PlayerId: number;
  };
  requestBodies: never;
  headers: {
    CacheControl: string;
    ETag: string;
    NoStore: string;
  };
  pathItems: never;
}
export type ActivityDetails = components['schemas']['ActivityDetails'];
export type ActivityItem = components['schemas']['ActivityItem'];
export type ActivityPage = components['schemas']['ActivityPage'];
export type ActivityType = components['schemas']['ActivityType'];
export type AdminActionData = components['schemas']['AdminActionData'];
export type AdminActionEvent = components['schemas']['AdminActionEvent'];
export type AdminEvent = components['schemas']['AdminEvent'];
export type AdminHealth = components['schemas']['AdminHealth'];
export type AdminHealthBackup = components['schemas']['AdminHealthBackup'];
export type AdminHealthCollector = components['schemas']['AdminHealthCollector'];
export type AdminHealthDb = components['schemas']['AdminHealthDb'];
export type AdminHealthJob = components['schemas']['AdminHealthJob'];
export type AdminPlayer = components['schemas']['AdminPlayer'];
export type AdminPlayerPage = components['schemas']['AdminPlayerPage'];
export type AdminSession = components['schemas']['AdminSession'];
export type AdminSettings = components['schemas']['AdminSettings'];
export type AdminSettingsUpdate = components['schemas']['AdminSettingsUpdate'];
export type Backup = components['schemas']['Backup'];
export type BackupList = components['schemas']['BackupList'];
export type BuildingPlacedData = components['schemas']['BuildingPlacedData'];
export type BuildingPlacedEvent = components['schemas']['BuildingPlacedEvent'];
export type CharacterGuid = components['schemas']['CharacterGuid'];
export type ChatChannel = components['schemas']['ChatChannel'];
export type ChatItem = components['schemas']['ChatItem'];
export type ChatMessageData = components['schemas']['ChatMessageData'];
export type ChatMessageEvent = components['schemas']['ChatMessageEvent'];
export type ChatPage = components['schemas']['ChatPage'];
export type CollectorAction = components['schemas']['CollectorAction'];
export type CollectorAdmin = components['schemas']['CollectorAdmin'];
export type CollectorEvent = components['schemas']['CollectorEvent'];
export type CollectorHeartbeatData = components['schemas']['CollectorHeartbeatData'];
export type CollectorHeartbeatEvent = components['schemas']['CollectorHeartbeatEvent'];
export type CollectorInfo = components['schemas']['CollectorInfo'];
export type CollectorLayers = components['schemas']['CollectorLayers'];
export type CollectorLayersSummary = components['schemas']['CollectorLayersSummary'];
export type CollectorRun = components['schemas']['CollectorRun'];
export type CollectorSecret = components['schemas']['CollectorSecret'];
export type CollectorStartedData = components['schemas']['CollectorStartedData'];
export type CollectorStartedEvent = components['schemas']['CollectorStartedEvent'];
export type CurrentSession = components['schemas']['CurrentSession'];
export type Death = components['schemas']['Death'];
export type Error = components['schemas']['Error'];
export type EventEnvelope = components['schemas']['EventEnvelope'];
export type EventPage = components['schemas']['EventPage'];
export type EventPlayer = components['schemas']['EventPlayer'];
export type Health = components['schemas']['Health'];
export type IngestBatch = components['schemas']['IngestBatch'];
export type IngestCounters = components['schemas']['IngestCounters'];
export type IngestResult = components['schemas']['IngestResult'];
export type ItemCraftedData = components['schemas']['ItemCraftedData'];
export type ItemCraftedEvent = components['schemas']['ItemCraftedEvent'];
export type Job = components['schemas']['Job'];
export type JobAccepted = components['schemas']['JobAccepted'];
export type JournalUnlockedData = components['schemas']['JournalUnlockedData'];
export type JournalUnlockedEvent = components['schemas']['JournalUnlockedEvent'];
export type LoginRequest = components['schemas']['LoginRequest'];
export type LogOtherData = components['schemas']['LogOtherData'];
export type LogOtherEvent = components['schemas']['LogOtherEvent'];
export type OnlineList = components['schemas']['OnlineList'];
export type OnlinePlayer = components['schemas']['OnlinePlayer'];
export type OtherEvent = components['schemas']['OtherEvent'];
export type Platform = components['schemas']['Platform'];
export type Player = components['schemas']['Player'];
export type PlayerCharacter = components['schemas']['PlayerCharacter'];
export type PlayerDiedData = components['schemas']['PlayerDiedData'];
export type PlayerDiedEvent = components['schemas']['PlayerDiedEvent'];
export type PlayerEventData = components['schemas']['PlayerEventData'];
export type PlayerEventEvent = components['schemas']['PlayerEventEvent'];
export type PlayerFeats = components['schemas']['PlayerFeats'];
export type PlayerHealth = components['schemas']['PlayerHealth'];
export type PlayerJoinedData = components['schemas']['PlayerJoinedData'];
export type PlayerJoinedEvent = components['schemas']['PlayerJoinedEvent'];
export type PlayerJournal = components['schemas']['PlayerJournal'];
export type PlayerKickedData = components['schemas']['PlayerKickedData'];
export type PlayerKickedEvent = components['schemas']['PlayerKickedEvent'];
export type PlayerLeftData = components['schemas']['PlayerLeftData'];
export type PlayerLeftEvent = components['schemas']['PlayerLeftEvent'];
export type PlayerPage = components['schemas']['PlayerPage'];
export type PlayerPatch = components['schemas']['PlayerPatch'];
export type PlayerQuests = components['schemas']['PlayerQuests'];
export type PlayerRef = components['schemas']['PlayerRef'];
export type PlayerRespawnedData = components['schemas']['PlayerRespawnedData'];
export type PlayerRespawnedEvent = components['schemas']['PlayerRespawnedEvent'];
export type PlayerSkill = components['schemas']['PlayerSkill'];
export type PlayerSummary = components['schemas']['PlayerSummary'];
export type PlayerXpData = components['schemas']['PlayerXpData'];
export type PlayerXpEvent = components['schemas']['PlayerXpEvent'];
export type QuestUpdatedData = components['schemas']['QuestUpdatedData'];
export type QuestUpdatedEvent = components['schemas']['QuestUpdatedEvent'];
export type Retention = components['schemas']['Retention'];
export type SavePlayerData = components['schemas']['SavePlayerData'];
export type SavePlayerEvent = components['schemas']['SavePlayerEvent'];
export type SaveQuest = components['schemas']['SaveQuest'];
export type SaveReadData = components['schemas']['SaveReadData'];
export type SaveReadEvent = components['schemas']['SaveReadEvent'];
export type SaveSkill = components['schemas']['SaveSkill'];
export type SaveWeather = components['schemas']['SaveWeather'];
export type SaveWorldData = components['schemas']['SaveWorldData'];
export type SaveWorldEvent = components['schemas']['SaveWorldEvent'];
export type SaveWorldTrigger = components['schemas']['SaveWorldTrigger'];
export type ServerInfo = components['schemas']['ServerInfo'];
export type ServerMetricsData = components['schemas']['ServerMetricsData'];
export type ServerMetricsEvent = components['schemas']['ServerMetricsEvent'];
export type ServerOfflineData = components['schemas']['ServerOfflineData'];
export type ServerOfflineEvent = components['schemas']['ServerOfflineEvent'];
export type ServerOnlineData = components['schemas']['ServerOnlineData'];
export type ServerOnlineEvent = components['schemas']['ServerOnlineEvent'];
export type ServerSavedData = components['schemas']['ServerSavedData'];
export type ServerSavedEvent = components['schemas']['ServerSavedEvent'];
export type ServerSettings = components['schemas']['ServerSettings'];
export type ServerStoppingData = components['schemas']['ServerStoppingData'];
export type ServerStoppingEvent = components['schemas']['ServerStoppingEvent'];
export type Session = components['schemas']['Session'];
export type SessionEndReason = components['schemas']['SessionEndReason'];
export type SessionPage = components['schemas']['SessionPage'];
export type SetupRequest = components['schemas']['SetupRequest'];
export type Site = components['schemas']['Site'];
export type SiteFeatures = components['schemas']['SiteFeatures'];
export type SkillLevelUpData = components['schemas']['SkillLevelUpData'];
export type SkillLevelUpEvent = components['schemas']['SkillLevelUpEvent'];
export type Status = components['schemas']['Status'];
export type StatusCollector = components['schemas']['StatusCollector'];
export type StatusHistory = components['schemas']['StatusHistory'];
export type StatusHistoryPoint = components['schemas']['StatusHistoryPoint'];
export type StatusPlayers = components['schemas']['StatusPlayers'];
export type StatusProcess = components['schemas']['StatusProcess'];
export type StatusSave = components['schemas']['StatusSave'];
export type StatusServer = components['schemas']['StatusServer'];
export type StatusState = components['schemas']['StatusState'];
export type StreamFrame = components['schemas']['StreamFrame'];
export type UserId = components['schemas']['UserId'];
export type Uuid = components['schemas']['Uuid'];
export type World = components['schemas']['World'];
export type WorldEvent = components['schemas']['WorldEvent'];
export type WorldSave = components['schemas']['WorldSave'];
export type WorldTotals = components['schemas']['WorldTotals'];
export type WorldWeather = components['schemas']['WorldWeather'];
export type ResponseBadRequest = components['responses']['BadRequest'];
export type ResponseConflict = components['responses']['Conflict'];
export type ResponseForbidden = components['responses']['Forbidden'];
export type ResponseNotFound = components['responses']['NotFound'];
export type ResponseRateLimited = components['responses']['RateLimited'];
export type ResponseUnauthorized = components['responses']['Unauthorized'];
export type ResponseUnavailable = components['responses']['Unavailable'];
export type ParameterCursor = components['parameters']['Cursor'];
export type ParameterJobId = components['parameters']['JobId'];
export type ParameterLastEventId = components['parameters']['LastEventId'];
export type ParameterLimit = components['parameters']['Limit'];
export type ParameterMagpieSignature = components['parameters']['MagpieSignature'];
export type ParameterMagpieTimestamp = components['parameters']['MagpieTimestamp'];
export type ParameterPlayerFilter = components['parameters']['PlayerFilter'];
export type ParameterPlayerId = components['parameters']['PlayerId'];
export type HeaderCacheControl = components['headers']['CacheControl'];
export type HeaderETag = components['headers']['ETag'];
export type HeaderNoStore = components['headers']['NoStore'];
export type $defs = Record<string, never>;
export interface operations {
  ingestBatch: {
    parameters: {
      query?: never;
      header: {
        'X-Magpie-Signature': components['parameters']['MagpieSignature'];
        'X-Magpie-Timestamp': components['parameters']['MagpieTimestamp'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['IngestBatch'];
      };
    };
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IngestResult'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  listActivity: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        player?: components['parameters']['PlayerFilter'];
        types?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['CacheControl'];
          ETag: components['headers']['ETag'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ActivityPage'];
        };
      };
      400: components['responses']['BadRequest'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  listBackups: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BackupList'];
        };
      };
      401: components['responses']['Unauthorized'];
      503: components['responses']['Unavailable'];
    };
  };
  runBackup: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobAccepted'];
        };
      };
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      409: components['responses']['Conflict'];
      503: components['responses']['Unavailable'];
    };
  };
  getAdminCollector: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CollectorAdmin'];
        };
      };
      401: components['responses']['Unauthorized'];
      503: components['responses']['Unavailable'];
    };
  };
  regenerateCollectorSecret: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CollectorSecret'];
        };
      };
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      409: components['responses']['Conflict'];
      503: components['responses']['Unavailable'];
    };
  };
  listAdminEvents: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        invalid?: boolean;
        limit?: components['parameters']['Limit'];
        player?: components['parameters']['PlayerFilter'];
        type?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EventPage'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      503: components['responses']['Unavailable'];
    };
  };
  getAdminHealth: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminHealth'];
        };
      };
      401: components['responses']['Unauthorized'];
      503: components['responses']['Unavailable'];
    };
  };
  getJob: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['JobId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      404: components['responses']['NotFound'];
      503: components['responses']['Unavailable'];
    };
  };
  adminLogin: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LoginRequest'];
      };
    };
    responses: {
      204: {
        headers: {
          'Set-Cookie'?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  adminLogout: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: components['responses']['Forbidden'];
    };
  };
  listAdminPlayers: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        q?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminPlayerPage'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      503: components['responses']['Unavailable'];
    };
  };
  updateAdminPlayer: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['PlayerId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PlayerPatch'];
      };
    };
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminPlayer'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      503: components['responses']['Unavailable'];
    };
  };
  rebuildProjections: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobAccepted'];
        };
      };
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      409: components['responses']['Conflict'];
      503: components['responses']['Unavailable'];
    };
  };
  getAdminSession: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminSession'];
        };
      };
      503: components['responses']['Unavailable'];
    };
  };
  getAdminSettings: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminSettings'];
        };
      };
      401: components['responses']['Unauthorized'];
      503: components['responses']['Unavailable'];
    };
  };
  updateAdminSettings: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AdminSettingsUpdate'];
      };
    };
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminSettings'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      409: components['responses']['Conflict'];
      503: components['responses']['Unavailable'];
    };
  };
  adminSetup: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SetupRequest'];
      };
    };
    responses: {
      204: {
        headers: {
          'Set-Cookie'?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
      400: components['responses']['BadRequest'];
      403: components['responses']['Forbidden'];
      409: components['responses']['Conflict'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  listChat: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['CacheControl'];
          ETag: components['headers']['ETag'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChatPage'];
        };
      };
      400: components['responses']['BadRequest'];
      404: components['responses']['NotFound'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  getHealth: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Health'];
        };
      };
    };
  };
  getOnline: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['CacheControl'];
          ETag: components['headers']['ETag'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OnlineList'];
        };
      };
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  getOpenApi: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': Record<string, never>;
        };
      };
    };
  };
  listPlayers: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        q?: string;
        sort?: 'last_seen' | 'playtime' | 'deaths' | 'name';
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['CacheControl'];
          ETag: components['headers']['ETag'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PlayerPage'];
        };
      };
      400: components['responses']['BadRequest'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  getPlayer: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['PlayerId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['CacheControl'];
          ETag: components['headers']['ETag'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Player'];
        };
      };
      400: components['responses']['BadRequest'];
      404: components['responses']['NotFound'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  listPlayerSessions: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
      };
      header?: never;
      path: {
        id: components['parameters']['PlayerId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['CacheControl'];
          ETag: components['headers']['ETag'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SessionPage'];
        };
      };
      400: components['responses']['BadRequest'];
      404: components['responses']['NotFound'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  getSite: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['CacheControl'];
          ETag: components['headers']['ETag'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Site'];
        };
      };
      429: components['responses']['RateLimited'];
    };
  };
  getStatus: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['CacheControl'];
          ETag: components['headers']['ETag'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Status'];
        };
      };
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  getStatusHistory: {
    parameters: {
      query?: {
        range?: '24h' | '7d' | '30d';
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['CacheControl'];
          ETag: components['headers']['ETag'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StatusHistory'];
        };
      };
      400: components['responses']['BadRequest'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  streamEvents: {
    parameters: {
      query?: {
        last_event_id?: string;
      };
      header?: {
        'Last-Event-ID'?: components['parameters']['LastEventId'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'text/event-stream': components['schemas']['StreamFrame'];
        };
      };
      503: components['responses']['Unavailable'];
    };
  };
  getWorld: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['CacheControl'];
          ETag: components['headers']['ETag'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['World'];
        };
      };
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
}
