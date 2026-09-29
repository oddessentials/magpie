import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { ActivityPage, Player, PlayerPage, SessionPage } from '$lib/api/types';
import { answerFromFixtures } from '$lib/server/mock/router';

async function get<T>(path: string): Promise<{ status: number; body: T }> {
  const url = new URL(`http://test${path}`);
  const response = await answerFromFixtures({
    url,
    request: new Request(url)
  } as unknown as RequestEvent);
  expect(response).not.toBeNull();
  return { status: response!.status, body: (await response!.json()) as T };
}

describe('mock API', () => {
  it('serves each player their own page and sessions', async () => {
    const { body: list } = await get<PlayerPage>('/api/v1/players?limit=200');
    expect(list.items.length).toBeGreaterThan(2);
    for (const summary of list.items) {
      const { status, body: player } = await get<Player>(`/api/v1/players/${summary.id}`);
      expect(status).toBe(200);
      expect(player.id).toBe(summary.id);
      expect(player.name).toBe(summary.name);
      expect(player.sessions).toBe(summary.sessions);
      const { body: sessions } = await get<SessionPage>(
        `/api/v1/players/${summary.id}/sessions?limit=200`
      );
      expect(sessions.items.length).toBe(Math.min(summary.sessions, 200));
    }
  });

  it('filters the activity feed by type and player', async () => {
    const { body: feed } = await get<ActivityPage>('/api/v1/activity?types=player.joined');
    expect(feed.items.length).toBeGreaterThan(0);
    expect(feed.items.every((item) => item.type === 'player.joined')).toBe(true);
    const player = feed.items[0]!.player!.id;
    const { body: mine } = await get<ActivityPage>(`/api/v1/activity?player=${player}`);
    expect(mine.items.every((item) => item.player?.id === player)).toBe(true);
  });

  it('answers 404 for a player that does not exist', async () => {
    const { status } = await get('/api/v1/players/999999');
    expect(status).toBe(404);
  });
});
