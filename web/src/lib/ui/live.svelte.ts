import { getContext, setContext } from 'svelte';
import { connectStream, type StreamConnection, type StreamState } from '$lib/api/sse';
import type { ActivityItem, OnlineList, Status } from '$lib/api/types';
import { upsertActivity } from './activity';

export type LiveStreamState = StreamState | 'off';

export const flushIntervalMs = 1000;

export class LiveState {
  status = $state<Status | null>(null);
  online = $state<OnlineList | null>(null);
  activity = $state<ActivityItem[]>([]);
  stream = $state<LiveStreamState>('off');
  private connection: StreamConnection | null = null;
  private pendingStatus: Status | null = null;
  private pendingOnline: OnlineList | null = null;
  private pendingActivity: ActivityItem[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastFlush = 0;

  start(): void {
    if (this.connection) return;
    this.connection = connectStream({
      onStatus: (status) => {
        this.pendingStatus = status;
        this.schedule();
      },
      onOnline: (online) => {
        this.pendingOnline = online;
        this.schedule();
      },
      onActivity: (item) => {
        this.pendingActivity.push(item);
        this.schedule();
      },
      onState: (state) => {
        this.stream = state;
      }
    });
    this.stream = this.connection.state;
  }

  stop(): void {
    this.connection?.close();
    this.connection = null;
    this.stream = 'off';
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.timer) return;
    const wait = Math.max(0, this.lastFlush + flushIntervalMs - Date.now());
    this.timer = setTimeout(() => this.flush(), wait);
  }

  private flush(): void {
    this.timer = null;
    this.lastFlush = Date.now();
    if (this.pendingStatus) {
      this.status = this.pendingStatus;
      this.pendingStatus = null;
    }
    if (this.pendingOnline) {
      this.online = this.pendingOnline;
      this.pendingOnline = null;
    }
    if (this.pendingActivity.length > 0) {
      let next = this.activity;
      for (const item of this.pendingActivity) next = upsertActivity(next, item, 200);
      this.activity = next;
      this.pendingActivity = [];
    }
  }
}

const key = Symbol('live');

export function provideLive(): LiveState {
  const live = new LiveState();
  setContext(key, live);
  return live;
}

export function useLive(): LiveState {
  return getContext<LiveState>(key);
}
