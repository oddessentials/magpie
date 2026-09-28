import { keysetResult, parseKeysetPage } from '$lib/server/http/respond';
import { publicGet, requireFeature } from '$lib/server/http/routes';
import { listChat } from '$lib/server/read/chat';

export const GET = publicGet(async ({ url }, db) => {
  await requireFeature('chat', db);
  const page = parseKeysetPage(url);
  const items = await listChat(db, page);
  return keysetResult(items, page, (item) => ({ ts: new Date(item.ts), id: item.id }));
});
