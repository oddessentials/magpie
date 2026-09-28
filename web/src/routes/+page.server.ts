import { attempt } from '$lib/ui/load';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const { api } = serverApi(fetch, url);
  const [online, activity, history] = await Promise.all([
    attempt(api.getOnline()),
    attempt(api.listActivity({ limit: 14 })),
    attempt(api.getStatusHistory('24h'))
  ]);
  return { online, activity, history };
};
