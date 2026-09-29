import { publicGet } from '$lib/server/http/routes';
import { getWorld } from '$lib/server/read/world';

export const GET = publicGet(async (_event, db) => getWorld(db));
