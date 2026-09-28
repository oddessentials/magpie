import { error } from '@sveltejs/kit';
import { attempt } from '$lib/ui/load';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url, params }) => {
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) error(404, 'No such player');
  const { api } = serverApi(fetch, url);
  const [player, sessions] = await Promise.all([
    attempt(api.getPlayer(id)),
    attempt(api.listPlayerSessions(id, { limit: 20 }))
  ]);
  if (!player.ok && player.error.status === 404) error(404, 'No such player');
  return { player, sessions };
};
