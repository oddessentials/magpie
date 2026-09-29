import { attempt } from '$lib/ui/load';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const { api } = serverApi(fetch, url);
  const [journal, ledger] = await Promise.all([
    attempt(api.getJournal()),
    attempt(api.getLedger())
  ]);
  return { journal, ledger };
};
