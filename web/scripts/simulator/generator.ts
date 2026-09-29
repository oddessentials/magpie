import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { CollectorEvent, IngestBatch, ServerInfo } from '../../src/lib/api/types.ts';

function readWorld<T>(name: string): T {
  return JSON.parse(
    readFileSync(new URL(`../../src/lib/world/${name}.json`, import.meta.url), 'utf8')
  ) as T;
}

const skillFacts = readWorld<{ skills: { id: string; enum: number; deleted: boolean }[] }>('skills')
  .skills.filter((skill) => !skill.deleted)
  .sort((a, b) => a.enum - b.enum);
const xpCurve = readWorld<{ xpForLevel: number[] }>('xp').xpForLevel;
const journalFacts = readWorld<{
  entries: { asset: string; deleted: boolean; category: string }[];
}>('journal').entries.filter((entry) => !entry.deleted);
const questFacts = readWorld<{ quests: { asset: string; deleted: boolean; hidden: boolean }[] }>(
  'quests'
).quests.filter((quest) => !quest.deleted && !quest.hidden);

export interface SimulatedPlayer {
  userId: string;
  characterGuid: string;
  name: string;
  platform: string;
  appetite: number;
  startHour: number;
  minMinutes: number;
  maxMinutes: number;
}

export interface GeneratorOptions {
  seed?: number;
  days?: number;
  endAt?: Date;
  stepS?: number;
  idleStepS?: number;
  tailMinutes?: number;
  tailStepS?: number;
}

export interface SimulatedRun {
  runId: string;
  startedAt: Date;
}

export interface SimulatedHistory {
  events: CollectorEvent[];
  runs: SimulatedRun[];
  players: SimulatedPlayer[];
  server: ServerInfo;
  endAt: Date;
  onlineAtEnd: SimulatedPlayer[];
}

function hex(text: string, length: number): string {
  return createHash('sha256').update(text).digest('hex').slice(0, length);
}

export const serverInfo: ServerInfo = {
  name: 'Magpie Test Server',
  version: '1.0.0.5',
  build: '++dominion+hotfix-CL-244954',
  world_name: 'magpie-test',
  world_guid: hex('world-magpie-test', 32).toUpperCase(),
  max_players: 6
};

export const serverSettings = {
  max_players: 6,
  platform_policy: 'Crossplay',
  save_frequency_min: 5
};

export const collectorName = 'magpie-collector';
export const collectorVersion = '0.1.0';
export const realMinutesPerDay = 48;

const cast: Omit<SimulatedPlayer, 'userId' | 'characterGuid' | 'platform'>[] = [
  { name: 'Wren', appetite: 0.9, startHour: 18, minMinutes: 60, maxMinutes: 180 },
  { name: 'Tamsin', appetite: 0.75, startHour: 19, minMinutes: 45, maxMinutes: 150 },
  { name: 'Orrin', appetite: 0.6, startHour: 20, minMinutes: 30, maxMinutes: 120 },
  { name: 'Juniper', appetite: 0.8, startHour: 17, minMinutes: 60, maxMinutes: 200 },
  { name: 'Kestrel', appetite: 0.55, startHour: 21, minMinutes: 30, maxMinutes: 100 },
  { name: 'Bramble', appetite: 0.5, startHour: 16, minMinutes: 40, maxMinutes: 140 }
];

export const skillIds = skillFacts.map((skill) => skill.id);

const journalPool = journalFacts
  .filter((entry) => entry.category === 'World' || entry.asset.startsWith('JOURNAL_Recipes_'))
  .map((entry) => entry.asset)
  .sort()
  .filter((_, index) => index % 23 === 0)
  .slice(0, 40);

const loginFlood = journalFacts
  .filter((entry) => entry.asset.startsWith('JOURNAL_Know_Tutorials_'))
  .map((entry) => entry.asset)
  .sort()
  .slice(0, 3);

const questPool = questFacts
  .map((quest) => quest.asset)
  .sort()
  .slice(0, 6);

const buildingPool = [
  'BP_Building_Wall_Wood',
  'BP_Building_Floor_Wood',
  'BP_Building_Roof_Thatch',
  'BP_Building_Door_Wood',
  'BP_Building_Campfire'
];

const recipePool = [
  'RECIPE_Rune_Air',
  'RECIPE_Axe_Bronze',
  'RECIPE_Food_Redberry_Dried',
  'RECIPE_Potion_Health',
  'RECIPE_Bow_Wood'
];

const killers = ['a chicken', 'a kebbit', 'a goblin', 'a wolf', 'the Black Knight Titan'];
const causes = ['fall', 'drowning', 'starvation', 'cold'];

const chatLines = [
  'anyone up for Velgar tonight?',
  'found copper past the vault',
  'heading back to the sanctuary',
  'who left the campfire burning',
  'brb',
  'gg',
  'the swamp is full of goblins',
  'need more runes, trade?',
  'meet at the lodestone',
  'night is falling, stay close',
  'lol',
  'got a new bow finally'
];

const weatherTypes = ['Sunny', 'Cloudy', 'Rain', 'Fog', 'Storm'];
const regions = ['base', 'dowdun', 'sands'];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uuidFrom(random: () => number): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hexText = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hexText.slice(0, 8)}-${hexText.slice(8, 12)}-${hexText.slice(12, 16)}-${hexText.slice(16, 20)}-${hexText.slice(20)}`;
}

interface Interval {
  from: number;
  to: number;
}

interface PlayerState {
  player: SimulatedPlayer;
  sessions: Interval[];
  xp: number[];
  levels: number[];
  journal: Set<string>;
  quests: Map<string, string>;
  buildings: number;
  crafts: number;
  playtimeS: number;
  online: boolean;
  dead: boolean;
  respawnAt: number | null;
  everPlayed: boolean;
}

function xpForLevel(level: number): number {
  return xpCurve[Math.min(level, xpCurve.length) - 1] ?? xpCurve[xpCurve.length - 1]!;
}

export function generateHistory(options: GeneratorOptions = {}): SimulatedHistory {
  const seed = options.seed ?? 20260928;
  const days = options.days ?? 7;
  const stepS = options.stepS ?? 120;
  const idleStepS = options.idleStepS ?? 900;
  const tailMinutes = options.tailMinutes ?? 15;
  const tailStepS = options.tailStepS ?? 15;
  const random = mulberry32(seed);
  const modRandom = mulberry32(seed ^ 0x5eed);
  const endMs = Math.floor((options.endAt ?? new Date()).getTime() / 1000) * 1000;
  const startMs = endMs - days * 86_400_000;
  const worldStartMs = startMs - 3 * 86_400_000;
  const tailFromMs = endMs - tailMinutes * 60_000;
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;
  const pickMod = <T>(items: T[]): T => items[Math.floor(modRandom() * items.length)]!;

  const players: SimulatedPlayer[] = cast.map((entry) => ({
    ...entry,
    userId: hex(`account-${seed}-${entry.name}`, 32),
    characterGuid: hex(`character-${seed}-${entry.name}`, 32).toUpperCase(),
    platform: 'pc'
  }));

  const downtimes: Interval[] = [];
  for (let day = 1; day < days; day++) {
    if (day % 3 !== 0) continue;
    const from = startMs + day * 86_400_000 + 5 * 3_600_000;
    if (from < tailFromMs) downtimes.push({ from, to: from + 3 * 60_000 });
  }
  const collectorRestartMs =
    startMs + Math.floor(days / 2) * 86_400_000 + 14 * 3_600_000 + 17 * 60_000;
  const collectorGap: Interval = { from: collectorRestartMs, to: collectorRestartMs + 20_000 };
  const serverDown = (ms: number) => downtimes.some((gap) => ms >= gap.from && ms < gap.to);

  const states: PlayerState[] = players.map((player, index) => {
    const sessions: Interval[] = [];
    for (let day = 0; day < days; day++) {
      const dayStart = startMs + day * 86_400_000;
      const plays = random() < player.appetite;
      const forced = day === days - 1 && index < 4;
      if (!plays && !forced) continue;
      let from = dayStart + (player.startHour + (random() * 3 - 1.5)) * 3_600_000;
      let to =
        from + (player.minMinutes + random() * (player.maxMinutes - player.minMinutes)) * 60_000;
      if (forced) {
        from = endMs - (40 + index * 17) * 60_000;
        to = endMs + 3_600_000;
      }
      for (const gap of downtimes) {
        if (from < gap.from && to > gap.from) to = gap.from - 30_000;
        if (from >= gap.from && from < gap.to) from = gap.to + 60_000;
      }
      from = Math.max(from, startMs + 60_000);
      if (to - from < 10 * 60_000) continue;
      if (from >= endMs) continue;
      sessions.push({ from: Math.round(from / 1000) * 1000, to: Math.round(to / 1000) * 1000 });
    }
    sessions.sort((a, b) => a.from - b.from);
    const merged: Interval[] = [];
    for (const session of sessions) {
      const last = merged[merged.length - 1];
      if (last && session.from <= last.to + 5 * 60_000) last.to = Math.max(last.to, session.to);
      else merged.push({ ...session });
    }
    const levels = skillIds.map(() => 3 + Math.floor(random() * 20));
    return {
      player,
      sessions: merged,
      xp: levels.map(
        (level) =>
          xpForLevel(level) + Math.floor(random() * (xpForLevel(level + 1) - xpForLevel(level)))
      ),
      levels,
      journal: new Set(),
      quests: new Map(),
      buildings: 0,
      crafts: 0,
      playtimeS: 0,
      online: false,
      dead: false,
      respawnAt: null,
      everPlayed: false
    };
  });

  const events: CollectorEvent[] = [];
  const runs: SimulatedRun[] = [];
  let runId = '';
  let seq = 0;
  const push = (ms: number, type: string, data: Record<string, unknown>) => {
    events.push({
      id: uuidFrom(random),
      seq: seq++,
      run_id: runId,
      ts: new Date(ms).toISOString(),
      type,
      data
    } as CollectorEvent);
  };
  const pushMod = (ms: number, type: string, data: Record<string, unknown>) => {
    events.push({
      id: uuidFrom(modRandom),
      seq: seq++,
      run_id: runId,
      ts: new Date(ms).toISOString(),
      type,
      v: 1,
      data
    } as CollectorEvent);
  };
  const identity = (state: PlayerState) => ({
    user_id: state.player.userId,
    character_guid: state.player.characterGuid,
    name: state.player.name
  });
  const startRun = (ms: number) => {
    runId = uuidFrom(random);
    seq = 0;
    runs.push({ runId, startedAt: new Date(ms) });
    push(ms, 'collector.started', {
      collector_version: collectorVersion,
      os: 'windows',
      arch: 'amd64',
      layers: { logs: true, logs_source: 'launch', saves: true, process: true, mod: true },
      server: serverInfo,
      settings: serverSettings
    });
    push(ms + 500, 'server.online', { ...serverInfo, settings: serverSettings });
  };

  let serverStartMs = startMs;
  let lastMetricsMs = -Infinity;
  let lastHeartbeatMs = -Infinity;
  let lastSaveMs = startMs;
  let collectorUp = true;
  let serverUp = true;
  startRun(startMs);

  const timeline: number[] = [];
  const logTimes = new Set<number>();
  for (const state of states) {
    for (const session of state.sessions) {
      logTimes.add(session.from);
      logTimes.add(session.from + 8_000);
      if (session.to <= endMs) logTimes.add(session.to);
    }
  }
  for (const gap of downtimes) {
    logTimes.add(gap.from - 30_000);
    logTimes.add(gap.from);
    logTimes.add(gap.to);
  }
  logTimes.add(collectorGap.from);
  logTimes.add(collectorGap.to);
  let cursor = startMs + 1000;
  while (cursor <= endMs) {
    timeline.push(cursor);
    const anyone = states.some((state) =>
      state.sessions.some((session) => cursor >= session.from && cursor < session.to)
    );
    const step = cursor >= tailFromMs ? tailStepS : anyone ? stepS : idleStepS;
    cursor += step * 1000;
  }
  const moments = [...new Set([...timeline, ...logTimes])]
    .filter((ms) => ms > startMs && ms <= endMs)
    .sort((a, b) => a - b);
  const tickMoments = new Set(timeline);

  const dayOf = (ms: number) => Math.floor((ms - worldStartMs) / (realMinutesPerDay * 60_000));
  const hourOf = (ms: number) => {
    const share =
      ((ms - worldStartMs) % (realMinutesPerDay * 60_000)) / (realMinutesPerDay * 60_000);
    return Math.round(share * 24 * 100) / 100;
  };
  const worldSave = (ms: number) => {
    const savedAt = new Date(ms).toISOString();
    push(ms, 'server.saved', { slot: serverInfo.world_name, ok: true });
    push(ms + 200, 'save.world', {
      saved_at: savedAt,
      world_guid: serverInfo.world_guid,
      world_name: serverInfo.world_name,
      progress: {
        world_hooks: ['WH_TempleFlyover'],
        defeated_bosses: ['ai_boss_velgar'],
        values: []
      },
      buildings: { total: 38, unfinished: 2, types: [{ id: 'sample-timber-wall', count: 38 }] },
      day: dayOf(ms),
      time_of_day: hourOf(ms),
      weather: regions.map((region, index) => ({
        region,
        type: weatherTypes[(dayOf(ms) + index) % weatherTypes.length],
        day_count: dayOf(ms),
        remaining_s: 600 + ((dayOf(ms) * 97 + index * 31) % 1800)
      })),
      events: dayOf(ms) % 4 === 0 ? [{ id: 'WORLDEVENT_Storm', name: null, state: 'Active' }] : [],
      hardcore: false,
      friendly_fire: false,
      difficulty: 'Normal',
      size_bytes: 480_000 + states.filter((state) => state.everPlayed).length * 42_000,
      last_saved_by: '++dominion+hotfix:244954'
    });
    const guids: string[] = [];
    for (const state of states) {
      if (!state.everPlayed) continue;
      guids.push(state.player.characterGuid);
      push(ms + 300, 'save.player', {
        saved_at: savedAt,
        character_guid: state.player.characterGuid,
        user_id: state.player.userId,
        name: state.player.name,
        playtime_s: Math.round(state.playtimeS),
        health: { current: state.dead ? 0 : 60 + Math.round(random() * 40), max: 100 },
        skills: skillIds.map((id, index) => ({ id, xp: state.xp[index] })),
        quests: [...state.quests].map(([id, questState]) => ({
          id,
          state: questState,
          objective: questState === 'Completed' ? null : 'Objective_1'
        })),
        journal_unlocked: state.journal.size + loginFlood.length,
        journal_unread: Math.floor(state.journal.size / 3),
        spells: 1 + Math.floor(state.journal.size / 6),
        regions_revealed: 1 + Math.floor(state.journal.size / 5)
      });
    }
    push(ms + 400, 'save.read', {
      saved_at: savedAt,
      world_guid: serverInfo.world_guid,
      character_guids: guids.sort()
    });
    lastSaveMs = ms;
  };

  const chatBudget = new Map<string, number>();

  for (const ms of moments) {
    if (ms === collectorGap.from) {
      push(ms, 'server.offline', { reason: 'collector_stopping' });
      collectorUp = false;
      continue;
    }
    if (ms === collectorGap.to) {
      collectorUp = true;
      startRun(ms);
      continue;
    }
    const gapWarning = downtimes.find((gap) => gap.from - 30_000 === ms);
    if (gapWarning && collectorUp) {
      push(ms, 'server.stopping', { by: 'collector', save: 'requested' });
      continue;
    }
    const gapStart = downtimes.find((gap) => gap.from === ms);
    if (gapStart) {
      if (collectorUp) {
        push(ms - 1000, 'server.saved', { slot: serverInfo.world_name, ok: true });
        push(ms, 'server.offline', { reason: 'stopped' });
      }
      serverUp = false;
      for (const state of states) state.online = false;
      continue;
    }
    const gapEnd = downtimes.find((gap) => gap.to === ms);
    if (gapEnd) {
      serverUp = true;
      serverStartMs = ms;
      if (collectorUp) push(ms, 'server.online', { ...serverInfo, settings: serverSettings });
      continue;
    }
    for (const state of states) {
      const session = state.sessions.find((entry) => ms >= entry.from && ms < entry.to);
      const logging = collectorUp && serverUp && !serverDown(ms);
      const nowOnline = serverUp && !serverDown(ms) && session !== undefined;
      if (!state.online && nowOnline) {
        state.online = true;
        state.dead = false;
        state.everPlayed = true;
        chatBudget.set(state.player.userId, Math.floor(random() * 5));
        if (logging && session.from === ms) {
          push(ms, 'player.joined', { ...identity(state), platform: 'PC', source: 'log' });
          loginFlood.forEach((entry, index) => {
            push(ms + 1000 + index * 100, 'journal.unlocked', { ...identity(state), entry });
          });
          pushMod(ms + 2000, 'player.event', {
            ...identity(state),
            tag: 'Event.Player.Joined'
          });
        }
      } else if (state.online && !nowOnline) {
        state.online = false;
        state.dead = false;
        if (logging) {
          push(ms, 'server.saved', { slot: serverInfo.world_name, ok: true });
          push(ms + 100, 'player.left', { ...identity(state), saved: true, source: 'log' });
        }
      }
    }
    if (!collectorUp || !serverUp || serverDown(ms)) continue;
    if (!tickMoments.has(ms)) continue;
    const tail = ms >= tailFromMs;
    const dtS = tail ? tailStepS : stepS;
    const online = states.filter((state) => state.online);

    for (const state of online) {
      state.playtimeS += dtS;
      if (state.dead && state.respawnAt !== null && ms >= state.respawnAt) {
        state.dead = false;
        state.respawnAt = null;
        push(ms, 'player.respawned', { ...identity(state), x: 5067.26, y: 189023.58, z: -3485.15 });
      }
      if (state.dead) continue;
      if (random() < (tail ? 0.08 : 0.25)) {
        const fresh = journalPool.filter((entry) => !state.journal.has(entry));
        if (fresh.length > 0) {
          const entry = pick(fresh);
          state.journal.add(entry);
          push(ms, 'journal.unlocked', { ...identity(state), entry });
        }
      }
      const skill = Math.floor(modRandom() * skillIds.length);
      const gain = 3 + Math.floor(modRandom() * 12);
      state.xp[skill] = (state.xp[skill] ?? 0) + gain;
      if (modRandom() < 0.35) {
        pushMod(ms, 'player.xp', {
          ...identity(state),
          skill: skillIds[skill],
          xp: state.xp[skill],
          delta: gain
        });
      }
      if (state.xp[skill]! >= xpForLevel((state.levels[skill] ?? 1) + 1)) {
        state.levels[skill] = (state.levels[skill] ?? 1) + 1;
        pushMod(ms + 1, 'skill.level_up', {
          ...identity(state),
          skill: skillIds[skill],
          level: state.levels[skill]
        });
      }
      if (!tail && modRandom() < 0.04) {
        const quest = pickMod(questPool);
        const current = state.quests.get(quest);
        if (current !== 'Completed') {
          const next = current === 'InProgress' ? 'Completed' : 'InProgress';
          state.quests.set(quest, next);
          pushMod(ms + 2, 'quest.updated', {
            ...identity(state),
            quest,
            state: next,
            objective: next === 'Completed' ? null : 'Objective_1'
          });
        }
      }
      if (modRandom() < (tail ? 0.02 : 0.12)) {
        state.buildings += 1;
        pushMod(ms + 3, 'building.placed', { ...identity(state), building: pickMod(buildingPool) });
      }
      if (modRandom() < (tail ? 0.02 : 0.1)) {
        state.crafts += 1;
        pushMod(ms + 4, 'item.crafted', {
          ...identity(state),
          recipe: pickMod(recipePool),
          count: 1 + Math.floor(modRandom() * 5)
        });
      }
      const deathChance = (dtS / 3600) * 0.7;
      if (!tail && random() < deathChance) {
        state.dead = true;
        state.respawnAt = ms + 20_000;
        const x = -120_000 + random() * 240_000;
        const y = 100_000 + random() * 200_000;
        push(ms, 'player.died', {
          ...identity(state),
          x: Math.round(x * 100) / 100,
          y: Math.round(y * 100) / 100,
          z: -1276.65,
          source: 'log'
        });
        const violent = modRandom() < 0.75;
        pushMod(ms + 1500, 'player.died', {
          ...identity(state),
          source: 'mod',
          cause: violent ? 'combat' : pickMod(causes),
          killer: violent ? pickMod(killers) : null
        });
        pushMod(ms + 1600, 'player.event', { ...identity(state), tag: 'Event.Player.Died' });
      }
      const budget = chatBudget.get(state.player.userId) ?? 0;
      if (budget > 0 && modRandom() < (tail ? 0.02 : 0.12)) {
        chatBudget.set(state.player.userId, budget - 1);
        const direct = modRandom() < 0.15;
        pushMod(ms - 1, 'chat.message', {
          ...identity(state),
          channel: direct ? 'direct' : 'global',
          text: pickMod(chatLines),
          recipients: direct ? 1 : 0
        });
      }
    }

    const metricsEvery = tail ? 30_000 : 300_000;
    if (ms - lastMetricsMs >= metricsEvery) {
      lastMetricsMs = ms;
      push(ms + 1, 'server.metrics', {
        memory_mb: Math.round((940 + online.length * 110 + random() * 40) * 10) / 10,
        uptime_s: Math.round((ms - serverStartMs) / 1000),
        players: online.length,
        max_players: serverSettings.max_players,
        cpu_percent: Math.round((4 + online.length * 6 + random() * 5) * 10) / 10
      });
    }
    const heartbeatEvery = tail ? 60_000 : 300_000;
    if (ms - lastHeartbeatMs >= heartbeatEvery) {
      lastHeartbeatMs = ms;
      push(ms + 2, 'collector.heartbeat', {
        uptime_s: Math.round((ms - runs[runs.length - 1]!.startedAt.getTime()) / 1000),
        queue_depth: 0,
        dropped_events: 0,
        logs: 'ok',
        saves: 'ok',
        process: 'ok',
        mod: 'ok'
      });
    }
    if (ms - lastSaveMs >= serverSettings.save_frequency_min * 60_000 && !tail) worldSave(ms + 5);
  }

  worldSave(endMs - 60_000);

  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => Date.parse(a.event.ts) - Date.parse(b.event.ts) || a.index - b.index)
    .map((entry) => entry.event);
  const counters = new Map<string, number>();
  for (const event of ordered) {
    const next = counters.get(event.run_id) ?? 0;
    event.seq = next;
    counters.set(event.run_id, next + 1);
  }
  return {
    events: ordered,
    runs,
    players,
    server: serverInfo,
    endAt: new Date(endMs),
    onlineAtEnd: states.filter((state) => state.online).map((state) => state.player)
  };
}

export const maxBatchEvents = 500;
export const maxBatchBytes = 480 * 1024;

export function toBatches(history: SimulatedHistory): IngestBatch[] {
  const batches: IngestBatch[] = [];
  let current: IngestBatch | null = null;
  let bytes = 0;
  for (const event of history.events) {
    const size = JSON.stringify(event).length + 1;
    if (
      !current ||
      current.collector.run_id !== event.run_id ||
      current.events.length >= maxBatchEvents ||
      bytes + size > maxBatchBytes
    ) {
      current = {
        collector: {
          name: collectorName,
          version: collectorVersion,
          run_id: event.run_id,
          os: 'windows',
          arch: 'amd64'
        },
        server: history.server,
        events: []
      };
      batches.push(current);
      bytes = 600;
    }
    current.events.push(event);
    bytes += size;
  }
  return batches;
}
