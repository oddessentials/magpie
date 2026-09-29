import { publicGet } from '$lib/server/http/routes';
import { getJournal } from '$lib/server/read/journal';

export const GET = publicGet(async (_event, db) => getJournal(db));
