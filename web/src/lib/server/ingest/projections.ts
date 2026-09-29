import { createHash } from 'node:crypto';
import { and, asc, eq, gte, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import type { components } from '$lib/api/types';
import { isQuestComplete } from '$lib/quests';
import {
  chatMessages,
  collectorRuns,
  deaths,
  events,
  feats,
  journalEntries,
  levelUps,
  players,
  serverMetrics,
  type PlayerRow
} from '../db/schema';
import {
  findPlayer,
  identifyPlayer,
  loadServerState,
  parseInstant,
  resolvePlayer,
  updatePlayer,
  updateServerState,
  type Identity,
  type ProjectionContext,
  type StoredEvent
} from './context';
import {
  bumpSessionCounter,
  closeAllSessions,
  closeSession,
  openSession,
  sessionJoinedAt
} from './sessions';
import { applySavePlayer, applySaveProgress, applySaveRead, applySaveWorld } from './saves';

type Schemas = components['schemas'];

export interface EventOutcome {
  playerId: number | null;
  quiet: boolean;
}

const plain: EventOutcome = { playerId: null, quiet: false };

export const deathMergeWindowMs = 60_000;

export const journalQuietAfterJoinMs = 60_000;

export const siteEventTypes = ['collector.lost'] as const;

export type SiteEventType = (typeof siteEventTypes)[number];

type ServerPatch = Parameters<typeof updateServerState>[1];

function serverPatch(
  server: Schemas['ServerInfo'] | null | undefined,
  settings: Schemas['ServerSettings'] | null | undefined
): ServerPatch {
  const patch: ServerPatch = {};
  if (server) {
    patch.serverName = server.name;
    patch.serverVersion = server.version ?? null;
    patch.serverBuild = server.build ?? null;
    patch.worldName = server.world_name;
    if (server.world_guid) patch.worldGuid = server.world_guid;
    if (typeof server.max_players === 'number') patch.maxPlayers = server.max_players;
  }
  if (settings && typeof settings.max_players === 'number') {
    patch.maxPlayers = settings.max_players;
  }
  return patch;
}

async function collectorStarted(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['CollectorStartedData'];
  const server = data.server ?? null;
  const settings = data.settings ?? null;
  if (!ctx.rebuild) {
    const values = {
      collectorVersion: data.collector_version,
      os: data.os,
      arch: data.arch,
      layers: data.layers as unknown as Record<string, unknown>,
      serverVersion: server?.version ?? null,
      serverName: server?.name ?? null,
      worldGuid: server?.world_guid ?? null,
      settings: settings as unknown as Record<string, unknown> | null
    };
    await ctx.tx
      .insert(collectorRuns)
      .values({ runId: event.run_id, startedAt: ts, lastSeenAt: ctx.receivedAt, ...values })
      .onConflictDoUpdate({
        target: collectorRuns.runId,
        set: {
          startedAt: sql`least(${collectorRuns.startedAt}, ${ts.toISOString()}::timestamptz)`,
          ...values
        }
      });
    await ctx.tx
      .update(collectorRuns)
      .set({ stoppedAt: ts })
      .where(
        and(
          ne(collectorRuns.runId, event.run_id),
          isNull(collectorRuns.stoppedAt),
          lt(collectorRuns.startedAt, ts)
        )
      );
  }
  const patch = serverPatch(server, settings);
  if (Object.keys(patch).length > 0) {
    await updateServerState(ctx, patch);
    ctx.effects.statusChanged = true;
  }
  return plain;
}

async function serverOnline(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['ServerOnlineData'];
  const state = await loadServerState(ctx);
  const transition = !state.online;
  const settings = data.settings ?? null;
  await updateServerState(ctx, {
    online: true,
    onlineSince: transition ? ts : state.onlineSince,
    offlineSince: transition ? null : state.offlineSince,
    stoppingAt: null,
    ...serverPatch(data, settings)
  });
  if (settings && !ctx.rebuild) {
    await ctx.tx
      .update(collectorRuns)
      .set({ settings: settings as unknown as Record<string, unknown> })
      .where(eq(collectorRuns.runId, event.run_id));
  }
  ctx.effects.statusChanged = true;
  return { playerId: null, quiet: !transition };
}

async function serverOffline(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['ServerOfflineData'];
  ctx.effects.statusChanged = true;
  if (data.reason === 'collector_stopping') {
    if (!ctx.rebuild) {
      await ctx.tx
        .update(collectorRuns)
        .set({ stoppedAt: ts })
        .where(and(eq(collectorRuns.runId, event.run_id), isNull(collectorRuns.stoppedAt)));
    }
    await closeAllSessions(ctx, ts, 'collector_stopped');
    return { playerId: null, quiet: true };
  }
  const state = await loadServerState(ctx);
  const transition = state.online;
  if (transition || state.stoppingAt) {
    await updateServerState(ctx, { online: false, offlineSince: ts, stoppingAt: null });
  }
  await closeAllSessions(ctx, ts, 'server_offline');
  return { playerId: null, quiet: !transition };
}

async function serverStopping(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['ServerStoppingData'];
  const state = await loadServerState(ctx);
  if (data.save === 'failed') {
    const stopping = state.stoppingAt !== null;
    if (stopping) await updateServerState(ctx, { stoppingAt: null });
    ctx.effects.statusChanged = true;
    return { playerId: null, quiet: !stopping };
  }
  const fresh = state.online && state.stoppingAt === null;
  if (fresh) await updateServerState(ctx, { stoppingAt: ts });
  ctx.effects.statusChanged = true;
  return { playerId: null, quiet: !fresh };
}

async function serverSaved(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['ServerSavedData'];
  const state = await loadServerState(ctx);
  if (data.ok && (!state.saveAt || ts > state.saveAt)) {
    await updateServerState(ctx, { saveAt: ts });
    ctx.effects.statusChanged = true;
  }
  return { playerId: null, quiet: true };
}

async function notePresence(ctx: ProjectionContext, ts: Date): Promise<void> {
  const state = await loadServerState(ctx);
  if (!state.presenceAt || ts > state.presenceAt) await updateServerState(ctx, { presenceAt: ts });
  ctx.effects.statusChanged = true;
}

async function playerJoined(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['PlayerJoinedData'];
  const player = await resolvePlayer(ctx, data.user_id, ts, {
    name: data.name,
    characterGuid: data.character_guid,
    platform: data.platform
  });
  const opened = await openSession(ctx, player, ts, 'log', event.run_id, event.id);
  await notePresence(ctx, ts);
  return { playerId: player.id, quiet: !opened };
}

async function playerLeft(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['PlayerLeftData'];
  const player = await resolvePlayer(ctx, data.user_id, ts, {
    name: data.name,
    characterGuid: data.character_guid
  });
  const closed = await closeSession(ctx, player, ts, 'left', event.id);
  await notePresence(ctx, ts);
  return { playerId: player.id, quiet: !closed };
}

async function mergeDeath(
  ctx: ProjectionContext,
  event: StoredEvent,
  data: Schemas['PlayerDiedData'],
  playerId: number,
  ts: Date
): Promise<boolean> {
  const partners = await ctx.tx
    .select()
    .from(deaths)
    .where(
      and(
        eq(deaths.playerId, playerId),
        ne(deaths.source, data.source),
        ne(deaths.eventId, event.id),
        isNull(deaths.mergedEventId),
        gte(deaths.at, new Date(ts.getTime() - deathMergeWindowMs)),
        lte(deaths.at, new Date(ts.getTime() + deathMergeWindowMs))
      )
    )
    .orderBy(
      sql`abs(extract(epoch from (${deaths.at} - ${ts.toISOString()}::timestamptz)))`,
      asc(deaths.id)
    )
    .limit(1);
  const partner = partners[0];
  if (!partner) return false;
  await ctx.tx
    .update(deaths)
    .set(
      data.source === 'mod'
        ? {
            mergedEventId: event.id,
            cause: data.cause ?? partner.cause,
            killer: data.killer ?? partner.killer
          }
        : {
            mergedEventId: event.id,
            x: data.x ?? partner.x,
            y: data.y ?? partner.y,
            z: data.z ?? partner.z
          }
    )
    .where(eq(deaths.id, partner.id));
  ctx.effects.changedEvents.push(partner.eventId);
  return true;
}

async function playerDied(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['PlayerDiedData'];
  const player = await identifyPlayer(ctx, data, ts);
  if (!player) return { playerId: null, quiet: true };
  if (await mergeDeath(ctx, event, data, player.id, ts)) {
    return { playerId: player.id, quiet: true };
  }
  const inserted = await ctx.tx
    .insert(deaths)
    .values({
      eventId: event.id,
      playerId: player.id,
      at: ts,
      x: data.x ?? null,
      y: data.y ?? null,
      z: data.z ?? null,
      source: data.source,
      cause: data.cause ?? null,
      killer: data.killer ?? null
    })
    .onConflictDoNothing()
    .returning({ id: deaths.id });
  if (inserted.length > 0) {
    await updatePlayer(ctx, player, { deaths: sql`${players.deaths} + 1`, dead: player.online });
    await bumpSessionCounter(ctx, player, 'deaths');
    if (player.online) ctx.effects.onlineChanged = true;
  }
  return { playerId: player.id, quiet: false };
}

async function playerRespawned(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['PlayerRespawnedData'];
  const player = await identifyPlayer(ctx, data, ts);
  if (player?.dead) {
    await updatePlayer(ctx, player, { dead: false });
    ctx.effects.onlineChanged = true;
  }
  return { playerId: player?.id ?? null, quiet: true };
}

async function journalUnlocked(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['JournalUnlockedData'];
  const player = await identifyPlayer(ctx, data, ts);
  if (!player) return { playerId: null, quiet: true };
  const inserted = await ctx.tx
    .insert(journalEntries)
    .values({ playerId: player.id, entry: data.entry, eventId: event.id, at: ts })
    .onConflictDoNothing()
    .returning({ entry: journalEntries.entry });
  if (inserted.length === 0) return { playerId: player.id, quiet: true };
  const joinedAt = await sessionJoinedAt(ctx, player);
  const flood = joinedAt !== null && ts.getTime() - joinedAt.getTime() < journalQuietAfterJoinMs;
  return { playerId: player.id, quiet: flood };
}

async function skillLevelUp(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['SkillLevelUpData'];
  const player = await identifyPlayer(ctx, data, ts);
  if (!player) return { playerId: null, quiet: true };
  await ctx.tx
    .insert(levelUps)
    .values({
      eventId: event.id,
      playerId: player.id,
      at: ts,
      skill: data.skill,
      level: data.level
    })
    .onConflictDoNothing();
  return { playerId: player.id, quiet: false };
}

async function recordFeat(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date,
  player: PlayerRow,
  kind: 'quest' | 'build' | 'craft',
  subject: string,
  detail: string | null
): Promise<void> {
  await ctx.tx
    .insert(feats)
    .values({ eventId: event.id, playerId: player.id, at: ts, kind, subject, detail })
    .onConflictDoNothing();
}

async function questUpdated(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['QuestUpdatedData'];
  const player = await identifyPlayer(ctx, data, ts);
  if (!player) return { playerId: null, quiet: true };
  const completed = isQuestComplete(data.state);
  if (completed) await recordFeat(ctx, event, ts, player, 'quest', data.quest, null);
  return { playerId: player.id, quiet: !completed };
}

async function buildingPlaced(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['BuildingPlacedData'];
  const player = await identifyPlayer(ctx, data, ts);
  if (player) await recordFeat(ctx, event, ts, player, 'build', data.building, null);
  return { playerId: player?.id ?? null, quiet: true };
}

async function itemCrafted(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['ItemCraftedData'];
  const player = await identifyPlayer(ctx, data, ts);
  if (player) {
    await recordFeat(
      ctx,
      event,
      ts,
      player,
      'craft',
      data.recipe,
      typeof data.count === 'number' ? String(data.count) : null
    );
  }
  return { playerId: player?.id ?? null, quiet: true };
}

async function quietlyLinked(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const player = await identifyPlayer(ctx, event.data as Identity, ts);
  return { playerId: player?.id ?? null, quiet: true };
}

async function chatMessage(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['ChatMessageData'];
  const player = await identifyPlayer(ctx, data, ts);
  const inserted = await ctx.tx
    .insert(chatMessages)
    .values({
      eventId: event.id,
      at: ts,
      playerId: player?.id ?? null,
      name: data.name,
      channel: data.channel,
      text: data.text
    })
    .onConflictDoNothing()
    .returning({ id: chatMessages.id });
  if (inserted.length > 0 && player) {
    await updatePlayer(ctx, player, { chatMessages: sql`${players.chatMessages} + 1` });
  }
  return { playerId: player?.id ?? null, quiet: false };
}

async function playerKicked(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['PlayerKickedData'];
  const player = await identifyPlayer(ctx, data, ts);
  return { playerId: player?.id ?? null, quiet: false };
}

async function collectorLost(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as { run_id?: string; last_seen_at?: string };
  const lastSeen = data.last_seen_at ? parseInstant(data.last_seen_at) : ts;
  if (!ctx.rebuild && data.run_id) {
    await ctx.tx
      .update(collectorRuns)
      .set({ lostAt: ts })
      .where(and(eq(collectorRuns.runId, data.run_id), isNull(collectorRuns.lostAt)));
  }
  await closeAllSessions(ctx, lastSeen, 'collector_lost');
  ctx.effects.statusChanged = true;
  return plain;
}

export async function applyEvent(
  ctx: ProjectionContext,
  event: StoredEvent
): Promise<EventOutcome> {
  const ts = parseInstant(event.ts);
  switch (event.type) {
    case 'collector.started':
      return collectorStarted(ctx, event, ts);
    case 'server.online':
      return serverOnline(ctx, event, ts);
    case 'server.stopping':
      return serverStopping(ctx, event, ts);
    case 'server.offline':
      return serverOffline(ctx, event, ts);
    case 'server.saved':
      return serverSaved(ctx, event, ts);
    case 'player.joined':
      return playerJoined(ctx, event, ts);
    case 'player.left':
      return playerLeft(ctx, event, ts);
    case 'player.died':
      return playerDied(ctx, event, ts);
    case 'player.respawned':
      return playerRespawned(ctx, event, ts);
    case 'journal.unlocked':
      return journalUnlocked(ctx, event, ts);
    case 'skill.level_up':
      return skillLevelUp(ctx, event, ts);
    case 'quest.updated':
      return questUpdated(ctx, event, ts);
    case 'building.placed':
      return buildingPlaced(ctx, event, ts);
    case 'item.crafted':
      return itemCrafted(ctx, event, ts);
    case 'player.xp':
    case 'player.event':
    case 'admin.action':
      return quietlyLinked(ctx, event, ts);
    case 'chat.message':
      return chatMessage(ctx, event, ts);
    case 'player.kicked':
      return playerKicked(ctx, event, ts);
    case 'collector.lost':
      return collectorLost(ctx, event, ts);
    case 'save.world':
      return applySaveWorld(ctx, event);
    case 'save.player':
      return applySavePlayer(ctx, event);
    case 'save.progress':
      return applySaveProgress(ctx, event);
    case 'save.read':
      return applySaveRead(ctx, event);
    case 'log.other':
      return { playerId: null, quiet: true };
    default:
      return plain;
  }
}

export async function markEvent(
  ctx: ProjectionContext,
  id: string,
  outcome: EventOutcome
): Promise<void> {
  if (outcome.playerId === null && !outcome.quiet) return;
  await ctx.tx
    .update(events)
    .set({ playerId: outcome.playerId, quiet: outcome.quiet })
    .where(eq(events.id, id));
}

export function siteEventId(
  type: string,
  runId: string,
  seq: number,
  ts: Date,
  data: Record<string, unknown>
): string {
  const hex = createHash('sha256')
    .update(`${type}|${runId}|${seq}|${ts.toISOString()}|${JSON.stringify(data)}`)
    .digest('hex');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function emitSiteEvent(
  ctx: ProjectionContext,
  type: SiteEventType,
  ts: Date,
  runId: string,
  seq: number,
  data: Record<string, unknown>
): Promise<StoredEvent | null> {
  if (ctx.rebuild) return null;
  const event: StoredEvent = {
    id: siteEventId(type, runId, seq, ts, data),
    seq,
    run_id: runId,
    ts: ts.toISOString(),
    type,
    data,
    source: 'site'
  };
  const inserted = await ctx.tx
    .insert(events)
    .values({
      id: event.id,
      runId,
      seq,
      type,
      ts,
      receivedAt: ctx.receivedAt,
      data,
      source: 'site'
    })
    .onConflictDoNothing()
    .returning({ id: events.id });
  if (inserted.length === 0) return null;
  await markEvent(ctx, event.id, await applyEvent(ctx, event));
  ctx.effects.siteEvents.push(event);
  return event;
}

export async function applyMetrics(ctx: ProjectionContext, event: StoredEvent): Promise<boolean> {
  const data = event.data as unknown as Schemas['ServerMetricsData'];
  const ts = parseInstant(event.ts);
  const inserted = await ctx.tx
    .insert(serverMetrics)
    .values({
      ts,
      memoryMb: data.memory_mb,
      uptimeS: data.uptime_s,
      players: data.players,
      maxPlayers: data.max_players ?? null,
      cpuPercent: data.cpu_percent ?? null
    })
    .onConflictDoNothing()
    .returning({ ts: serverMetrics.ts });
  if (inserted.length === 0) return false;
  const state = await loadServerState(ctx);
  if (!state.metricsAt || ts > state.metricsAt) {
    await updateServerState(ctx, {
      memoryMb: data.memory_mb,
      uptimeS: data.uptime_s,
      cpuPercent: data.cpu_percent ?? null,
      metricsAt: ts,
      ...(typeof data.max_players === 'number' ? { maxPlayers: data.max_players } : {})
    });
    ctx.effects.statusChanged = true;
  }
  return true;
}

export async function applyHeartbeat(ctx: ProjectionContext, event: StoredEvent): Promise<boolean> {
  const ts = parseInstant(event.ts);
  const updated = await ctx.tx
    .update(collectorRuns)
    .set({ heartbeat: event.data, heartbeatAt: ts })
    .where(
      and(
        eq(collectorRuns.runId, event.run_id),
        or(isNull(collectorRuns.heartbeatAt), lt(collectorRuns.heartbeatAt, ts))
      )
    )
    .returning({ runId: collectorRuns.runId });
  return updated.length > 0;
}

export async function playerOfUser(
  ctx: ProjectionContext,
  userId: string
): Promise<PlayerRow | null> {
  return findPlayer(ctx, userId);
}
