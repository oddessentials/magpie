import { publicGet, requireFeature } from '$lib/server/http/routes';
import { mapLive } from '$lib/server/read/map';

export const GET = publicGet(async (_event, db) => {
  await requireFeature('positions', db);
  return mapLive(db);
});
