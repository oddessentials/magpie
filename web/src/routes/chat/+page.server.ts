import { error } from '@sveltejs/kit';
import { attempt } from '$lib/ui/load';
import { pickText } from '$lib/ui/query';
import { serverApi } from '$lib/ui/server';
import { t } from '$lib/ui/strings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url, parent }) => {
  const { features } = await parent();
  if (features && !features.chat) error(404, t.chat.off);
  const { api } = serverApi(fetch, url);
  const cursor = pickText(url.searchParams, 'cursor');
  return {
    chat: await attempt(api.listChat({ cursor, limit: 100 })),
    paged: cursor !== undefined
  };
};
