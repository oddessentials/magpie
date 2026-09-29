import { attempt } from '$lib/ui/load';
import { parseFind } from '$lib/ui/map';
import { creaturesByAsset, itemName, liveJournal } from '$lib/server/read/lookup';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

function findLabel(text: string | null): string | null {
  const find = parseFind(text);
  if (!find) return null;
  if (find.kind === 'item') return itemName(find.key);
  if (find.kind === 'creature') return creaturesByAsset.get(find.key)?.name ?? null;
  if (find.kind === 'lore')
    return liveJournal.find((entry) => entry.asset === find.key)?.name ?? null;
  return find.key;
}

export const load: PageServerLoad = async ({ fetch, url, parent }) => {
  const { api } = serverApi(fetch, url);
  const { features } = await parent();
  const [map, world, live] = await Promise.all([
    attempt(api.getWorldMap()),
    attempt(api.getWorld()),
    features?.positions ? attempt(api.getMapLive()) : Promise.resolve(null)
  ]);
  return {
    map,
    world,
    live: live?.ok ? live.data : null,
    findLabel: findLabel(url.searchParams.get('find'))
  };
};
