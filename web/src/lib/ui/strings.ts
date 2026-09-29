export const t = {
  site: {
    tagline: 'a dragonwilds server log',
    skip: 'Skip to the page',
    description: (name: string) => `Who is on ${name}, what they are up to, and what happened.`,
    footerNote: 'the magpie keeps what it finds.',
    disclaimer:
      "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.",
    provenance:
      'Everything here comes from the server log, its world save and its process; players install nothing. Times are stored in UTC and shown in your time zone.',
    statusJson: 'Status JSON',
    apiContract: 'API contract',
    machineReadable: 'Machine-readable',
    siteVersion: 'Site',
    collectorVersion: 'Collector',
    gameVersion: 'Dragonwilds'
  },
  nav: {
    label: 'Site',
    today: 'Today',
    players: 'Players',
    activity: 'Activity',
    chat: 'Chat',
    world: 'World',
    admin: 'Admin'
  },
  status: {
    online: 'Server online',
    stopping: 'Saving, then stopping',
    offline: 'Server offline',
    unknown: 'Status unknown',
    players: (online: number, max: number | null) =>
      `${online} of ${max ?? '?'} ${online === 1 && max === null ? 'player' : 'players'}`,
    collectorLost: 'Lost contact with the collector',
    collectorStopped: 'The collector stopped',
    collectorNone: 'No collector has reported yet',
    lastHeard: 'last heard',
    upSince: 'up since',
    unavailable: 'Status unavailable',
    streamTitle: 'Live updates from the event stream',
    stream: {
      open: 'live',
      connecting: 'connecting',
      reconnecting: 'reconnecting',
      closed: 'stream closed',
      off: 'not live'
    }
  },
  freshness: {
    log: 'from the log',
    save: 'from the last save',
    process: 'from the process',
    collector: 'from the collector',
    unknown: 'not observed yet'
  },
  time: {
    justNow: 'just now',
    seconds: (n: number) => `${n} s`,
    minutes: (n: number) => `${n} min`,
    hours: (n: number) => `${n} h`,
    days: (n: number) => `${n} d`,
    weeks: (n: number) => `${n} wk`,
    months: (n: number) => `${n} mo`,
    ago: (text: string) => `${text} ago`,
    ahead: (text: string) => `in ${text}`,
    ongoing: 'ongoing'
  },
  pager: {
    label: 'Pages',
    newest: 'Newest',
    older: 'Older',
    onThisPage: (count: number, label: string) => `${count} ${label} on this page`
  },
  errors: {
    couldNotLoad: (what: string) => `Could not load ${what}.`,
    rateLimited: 'The API is rate limited right now. Reload in a minute.',
    unavailable: 'The database or the site cannot be reached right now. Reload in a moment.',
    notFound: 'Nothing was found at this address.',
    unauthorized: 'An admin session is required.',
    notImplemented: 'This part of the API is not built yet.',
    network: 'network',
    pageNotFound: 'Nothing on this branch',
    pageBroken: 'The magpie dropped it',
    notFoundNote: 'nothing lives at this address.',
    brokenNote: 'something went wrong on our side.',
    backToToday: 'Back to today',
    adminNeeded: 'Admin access needed',
    nothingHere: 'Nothing here',
    somethingWrong: 'Something went wrong',
    unknownError: 'unknown error',
    logIn: 'Log in'
  },
  today: {
    day: (day: number) => `day ${day}`,
    headline: {
      unknown: 'Out of contact',
      offline: 'The server is resting',
      empty: 'The wilds are quiet',
      one: 'One adventurer in the wilds',
      many: (n: string) => `${n} adventurers in the wilds`
    },
    onlineTitle: 'In the wilds',
    nobody: 'nobody right now',
    emptyOnline: 'the wilds are empty. someone will wander in.',
    emptyOffline: 'no one can be out while the server is down.',
    onSince: 'on since',
    fallen: 'fallen',
    latestTitle: 'Latest',
    everything: 'Everything',
    nothingYet: 'nothing has happened yet.',
    lastDay: 'The last day',
    serverHistory: 'Server history',
    lastSave: 'Last save',
    noSave: 'no save read yet',
    setup: {
      title: 'Two steps to a live site',
      note: 'No collector has reported yet. The site fills in as soon as one does.',
      passwordStep: 'Set the admin password and open the collector page for the shared secret.',
      collectorStep:
        "Run the collector beside the dedicated server with this site's address and that secret. It reads the server log and the world save and posts what it finds here.",
      openAdmin: 'Open admin'
    }
  },
  activity: {
    title: 'Activity',
    eyebrow: 'The log',
    note: 'Everything the server reported, newest first. New lines appear as they happen.',
    description: 'Everything that happened on the server, newest first.',
    filterLabel: 'Filter activity',
    everything: 'Everything',
    empty: 'Nothing like that has happened yet.',
    lines: 'lines',
    feedLabel: 'Activity feed',
    someone: 'Someone',
    labels: {
      'server.online': 'Server up',
      'server.stopping': 'Stopping',
      'server.offline': 'Server down',
      'collector.lost': 'Contact lost',
      'player.joined': 'Entered',
      'player.left': 'Left',
      'player.died': 'Died',
      'journal.unlocked': 'Discovered',
      'skill.level_up': 'Level up',
      'quest.updated': 'Quest',
      'chat.message': 'Chat',
      'player.kicked': 'Kicked'
    },
    filters: {
      presence: 'Comings and goings',
      deaths: 'Deaths',
      discoveries: 'Discoveries',
      progress: 'Progress',
      chat: 'Chat',
      server: 'Server'
    },
    phrases: {
      serverOnline: 'The server came online',
      serverOnlineVersion: (version: string) => `The server came online (${version})`,
      serverStopping: 'The server is saving, then stopping',
      serverStoppingBy: (by: string) => `The server is saving, then stopping, as ${by} asked`,
      serverSaveFailed: 'The world save failed; the server keeps running',
      serverStopped: 'The server stopped',
      serverCrashed: 'The server crashed',
      serverUnreachable: 'The server stopped answering',
      collectorStopping: 'The collector stopped watching',
      collectorLost: 'Lost contact with the collector',
      joined: ' entered the wilds',
      left: ' left the wilds',
      leftAfter: (duration: string) => ` left after ${duration}`,
      died: ' died',
      diedOf: (cause: string) => ` died of ${cause}`,
      slainBy: (killer: string) => ` was slain by ${killer}`,
      discovered: (what: string) => ` discovered ${what}`,
      levelUp: (level: number, skill: string) => ` reached level ${level} in ${skill}`,
      questDone: (quest: string) => ` completed ${quest}`,
      questAdvanced: (quest: string) => ` advanced ${quest}`,
      kicked: ' was kicked',
      kickedBy: (by: string) => ` was kicked by ${by}`
    },
    channels: { global: 'Global', direct: 'Direct', other: 'Other' }
  },
  players: {
    title: 'Players',
    eyebrow: 'The roster',
    note: 'Everyone who has joined since the site began keeping the log. Playtime counts from join to leave, including the session in progress.',
    description: 'Everyone who has played on the server, with their playtime and deaths.',
    searchLabel: 'Search players',
    searchPlaceholder: 'Name',
    search: 'Search',
    clear: 'Clear',
    sortLabel: 'Sort players',
    sorts: { last_seen: 'Recent', playtime: 'Playtime', deaths: 'Deaths', name: 'Name' },
    columns: {
      player: 'Player',
      playtime: 'Playtime',
      sessions: 'Sessions',
      deaths: 'Deaths',
      firstSeen: 'First seen',
      lastSeen: 'Last seen'
    },
    onlineNow: 'online now',
    onlineTitle: 'Online now',
    offlineTitle: 'Offline',
    noMatch: 'No players match that name.',
    empty: 'Nobody has joined the server yet.',
    unit: 'players'
  },
  player: {
    description: (name: string, playtime: string) => `${name}: ${playtime} played.`,
    online: 'Online now',
    offline: 'Offline',
    onSince: 'on since',
    lastSeen: 'last seen',
    stats: {
      played: 'Played',
      sessions: 'Sessions',
      deaths: 'Deaths',
      chat: 'Chat lines',
      journal: 'Journal entries',
      quests: 'Quests done'
    },
    skillsTitle: 'Skills',
    skillsNote:
      'the twelve skills from the character save, levelled by the game’s experience curve.',
    skillsEmpty: 'The collector has not read this character from the world save yet.',
    skillPlaceholder: (n: number) => `Skill ${n}`,
    totalLevel: 'Total level',
    xp: 'xp',
    characterTitle: 'From the save',
    characterNote: 'what the world save recorded about this character, never live.',
    health: 'Health',
    playtimeInGame: 'Time in this world',
    questsActive: 'Quests under way',
    questsDone: 'Quests completed',
    journalUnlocked: 'Journal entries',
    journalUnread: 'Unread',
    spells: 'Spells',
    regions: 'Regions revealed',
    seenTitle: 'Seen in the log',
    seenNote: 'counted from what the site has watched.',
    levelUps: 'Level-ups',
    buildings: 'Buildings placed',
    crafts: 'Items crafted',
    sessionsTitle: 'Sessions',
    sessionsEmpty: 'no sessions yet.',
    columns: { joined: 'Joined', length: 'Length', deaths: 'Deaths', ended: 'Ended' },
    endReasons: {
      left: 'left',
      server_offline: 'server went down',
      collector_stopped: 'collector stopped',
      collector_lost: 'contact lost'
    },
    deathsTitle: 'Recent deaths',
    deathsEmpty: 'never died. yet.',
    deathSource: { log: 'from the log', mod: 'from the server mod' },
    unit: 'sessions'
  },
  chat: {
    title: 'Chat',
    eyebrow: 'Overheard',
    note: 'Chat as the server mod reports it. It is switched off until the site admin turns it on.',
    description: 'What players said in the server chat.',
    empty: 'Nobody has said anything yet.',
    lines: 'lines',
    off: 'Chat is switched off on this site'
  },
  world: {
    title: 'The world',
    eyebrow: 'The wilds',
    note: 'The server as the collector reads it, the last world save, and everything counted since the site began keeping the log.',
    description: 'The world save, the server and the totals of this server.',
    trackingSince: 'keeping the log since',
    totals: {
      players: 'Players',
      sessions: 'Sessions',
      played: 'Played',
      deaths: 'Deaths',
      levelUps: 'Level-ups',
      journal: 'Discoveries',
      quests: 'Quests done'
    },
    playersOverTime: 'Players over time',
    saveTitle: 'The last save',
    saveNote: 'the world as the server last wrote it; nothing here is live.',
    noSave: 'the collector has not read a world save yet.',
    day: 'Day',
    timeOfDay: 'Time of day',
    difficulty: 'Difficulty',
    hardcore: 'Hardcore',
    friendlyFire: 'Friendly fire',
    saveSize: 'Save size',
    yes: 'Yes',
    no: 'No',
    weatherTitle: 'Weather by region',
    weatherEmpty: 'the save named no weather.',
    eventsTitle: 'World events',
    eventsEmpty: 'no world events in the save.',
    serverTitle: 'Server',
    serverName: 'Name',
    worldName: 'World',
    version: 'Version',
    maxPlayers: 'Players at once',
    seesTitle: 'What this site can see',
    seesEmpty: 'no collector has reported yet.',
    notRead: ', not read',
    layers: {
      logs: { name: 'The log', detail: 'joins and leaves to the second, deaths, discoveries' },
      saves: { name: 'The world save', detail: 'skills, quests, journal, weather and the day' },
      process: {
        name: 'The process',
        detail: 'memory and uptime, when the collector starts the server'
      },
      mod: { name: 'Server mod', detail: 'chat, level-ups, quests, buildings and crafts' }
    }
  },
  admin: {
    rail: 'Admin',
    firstStart: 'First start',
    notLoggedIn: 'Not logged in',
    sessionEnds: 'Session ends',
    unknownTime: 'at an unknown time',
    logOut: 'Log out',
    navLabel: 'Admin',
    links: {
      health: 'Health',
      players: 'Players',
      events: 'Raw events',
      collector: 'Collector',
      settings: 'Settings'
    },
    login: {
      title: 'Admin login',
      eyebrow: 'The gate',
      description: 'Log in to manage players, jobs and backups.',
      already: 'You are already logged in.',
      goAdmin: 'Go to the admin pages.',
      password: 'Password',
      submit: 'Log in',
      wrong: 'That password is wrong.',
      tooMany: 'Too many attempts. Wait a minute and try again.',
      note: 'One shared password, five attempts per minute. The session lasts twelve hours.'
    },
    setup: {
      title: 'Set the admin password',
      description: 'Set the admin password for this site.',
      password: 'Password',
      repeat: 'Repeat the password',
      submit: 'Set password',
      tooShort: (n: number) => `Use at least ${n} characters.`,
      mismatch: 'The two passwords are not the same.',
      alreadySet: 'A password is already set. Log in with it instead.',
      tooMany: 'Too many attempts. Wait a minute and try again.',
      refused: "The request was refused. Open this page on the site's own address.",
      note: (n: number) =>
        `Whoever opens this page first sets the password, so do it right after deploying. It is stored as a scrypt hash. At least ${n} characters.`
    },
    health: {
      title: 'Site health',
      description: 'The collector connection, ingest, backups and jobs.',
      collector: 'Collector',
      connection: 'Connection',
      state: 'State',
      heartbeat: 'Heartbeat',
      never: 'never',
      agoSuffix: 'ago',
      logs: 'Log',
      saves: 'Saves',
      process: 'Process',
      mod: 'Mod',
      queued: 'Queued, dropped',
      states: {
        active: 'connected',
        stopped: 'stopped',
        lost: 'lost contact',
        none: 'never connected'
      },
      runLine: (started: string, version: string, os: string, arch: string, server: string) =>
        `Run started ${started}, collector ${version} on ${os}/${arch}, server ${server}.`,
      versionMismatch: (collector: string, site: string) =>
        `The collector is ${collector} and this site is ${site}. They work together, but matching versions get every feature.`,
      ingest: 'Ingest, last 24 hours',
      batches: 'Batches',
      events: 'Events',
      duplicates: 'Duplicates',
      flagged: 'Flagged',
      rejected: 'Rejected',
      lastBatch: 'Last batch',
      database: 'Database',
      size: 'Size',
      backups: 'Backups',
      lastBackup: 'Last backup',
      kept: 'Kept',
      nightly: 'nightly dumps',
      jobs: 'Background jobs',
      noJobs: 'No jobs registered.',
      job: 'Job',
      lastRun: 'Last run',
      result: 'Result',
      notRun: 'not run yet',
      ok: 'ok',
      failed: (error: string) => `failed: ${error}`,
      maintenance: 'Maintenance',
      rebuild: 'Rebuild history',
      backupNow: 'Back up now',
      jobLine: (id: number, kind: string) => `Job ${id} (${kind}):`,
      kinds: { backup: 'backup', rebuild: 'rebuild' },
      alreadyRunning: 'A job is already running. Wait for it to finish.',
      rebuildNote:
        'A rebuild replays every stored event into sessions, deaths, discoveries, level-ups, chat and the saves. Ingest pauses while it runs.',
      backupFiles: 'Backup files',
      noBackups: 'No backup has been written yet.',
      taken: 'Taken',
      file: 'File',
      unknown: 'unknown'
    },
    collector: {
      title: 'Collector',
      description: 'Connect the Magpie collector to this site.',
      note: 'The collector runs beside the dedicated server, reads its log, its world save and its process, and posts signed batches here. It needs this site’s address and the shared secret.',
      secret: 'Shared secret',
      show: 'Show',
      hide: 'Hide',
      copy: 'Copy',
      copied: 'Copied',
      replace: 'Replace',
      fromEnvironment: 'set by COLLECTOR_SECRET in the site’s environment.',
      replaced: 'New secret stored. Give it to the collector; the old one no longer works.',
      cannotReplace:
        'COLLECTOR_SECRET is set in the environment, so the secret cannot be replaced here.',
      copyFailed: 'The browser did not allow copying; select the text instead.',
      settingsTitle: 'Collector settings',
      settingsNote:
        'A starting point for the collector configuration. Every key can also come from the environment.',
      secretPlaceholder: '<the secret above>',
      siteVersion: (version: string) =>
        `This site runs version ${version}. On Windows, let the collector launch the server so log lines and process metrics arrive at once.`,
      ingest: 'Ingest, last 24 hours',
      runs: 'Runs',
      noRuns: 'No collector has connected yet.',
      columns: {
        started: 'Started',
        version: 'Version',
        platform: 'Platform',
        server: 'Server',
        lastSeen: 'Last seen',
        state: 'State'
      },
      running: 'running',
      stopped: 'stopped',
      lost: 'lost'
    },
    players: {
      title: 'Players',
      description: 'Rename or hide players, and see their account ids.',
      note: 'Account ids and character guids are shown only here. A hidden player disappears from every public page, list and feed; their history is kept.',
      searchPlaceholder: 'Name, account id or guid',
      search: 'Search',
      refused: 'The request was refused: admin changes must come from this site.',
      noMatch: 'No players match.',
      empty: 'Nobody has joined yet.',
      columns: {
        player: 'Player',
        accountId: 'Account id',
        characterGuid: 'Character guid',
        played: 'Played',
        lastSeen: 'Last seen',
        edit: 'Edit'
      },
      inGame: (name: string) => `in game ${name}`,
      hidden: 'hidden',
      save: 'Save',
      cancel: 'Cancel',
      rename: 'Rename',
      hide: 'Hide',
      show: 'Show',
      unit: 'players'
    },
    events: {
      title: 'Raw events',
      description: 'Every stored event with its data, newest first.',
      note: 'Events as the collector sent them, plus the ones the site wrote itself. Flagged events did not match the contract and were stored without being counted.',
      typePlaceholder: 'player.joined',
      flaggedOnly: 'Flagged only',
      filter: 'Filter',
      empty: 'No events match.',
      columns: { time: 'Time', type: 'Type', player: 'Player', from: 'From', notes: 'Notes' },
      runLine: (run: string, seq: number) => `run ${run} · seq ${seq} · received`,
      flagged: (why: string) => `flagged: ${why}`,
      quiet: 'not in the feed',
      unit: 'events'
    },
    settings: {
      title: 'Settings',
      description: 'Name the site and choose what it shows.',
      note: 'A setting given by an environment variable wins over the value stored here and cannot be changed on this page.',
      site: 'Site',
      siteName: 'Site name',
      nameLocked: 'Set by PUBLIC_SITE_NAME.',
      nameNote: 'Shown in the header, the browser tab and link previews.',
      featuresLegend: 'What the public pages show',
      features: {
        chat: {
          label: 'Chat',
          description:
            'Chat lines in the feed, on the chat page and in the stream. Off by default: chat reaches the site through a server mod that players may not expect.'
        }
      },
      featuresNote: 'The site keeps recording everything; a switch only decides what visitors see.',
      retentionLegend: 'How long to keep raw data',
      retention: {
        metrics_days: {
          label: 'Process metrics',
          unit: 'days',
          description: 'Memory and uptime of the server process, behind the server history.'
        },
        status_samples_days: {
          label: 'Status samples',
          unit: 'days',
          description: 'The one-minute samples behind the history chart.'
        },
        world_saves_days: {
          label: 'World save readings',
          unit: 'days',
          description:
            'Day counts and weather from each save the collector read; the latest always stays.'
        }
      },
      retentionNote:
        'Players, sessions, deaths, discoveries, level-ups and chat stay whatever you pick.',
      retentionRange: (label: string, unit: string, max: number) =>
        `${label}: a whole number of ${unit} from 1 to ${max}.`,
      nameLength: 'The site name must be 1 to 60 characters.',
      nothingChanged: 'Nothing changed.',
      saved: 'Saved.',
      save: 'Save',
      refused: 'The request was refused: admin changes must come from this site.'
    }
  }
} as const;

export function humanize(id: string): string {
  return id
    .replace(/^JOURNAL_/, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
    .join(' ')
    .trim();
}

export function journalName(entry: string): string {
  const parts = entry
    .replace(/^JOURNAL_/, '')
    .split('_')
    .filter(Boolean);
  const name = parts.length > 2 ? parts.slice(2).join(' ') : parts.join(' ');
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

export function journalCategory(entry: string): string | null {
  const parts = entry
    .replace(/^JOURNAL_/, '')
    .split('_')
    .filter(Boolean);
  return parts.length > 2 ? parts[1]!.replace(/([a-z0-9])([A-Z])/g, '$1 $2') : null;
}
