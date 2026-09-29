import { pageResult, parsePage, parsePathId } from '$lib/server/http/respond';
import { publicGet } from '$lib/server/http/routes';
import { listSessions } from '$lib/server/read/players';

export const GET = publicGet(async ({ params, url }, db) => {
  const page = parsePage(url);
  const items = await listSessions(db, parsePathId(params.id, 'id'), page);
  return pageResult(items, page);
});
