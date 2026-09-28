import { publicGet } from '$lib/server/http/routes';
import { computeOnline } from '$lib/server/read/status';

export const GET = publicGet(async (_event, db) => computeOnline(db));
