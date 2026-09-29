import { publicGet } from '$lib/server/http/routes';
import { getLedger } from '$lib/server/read/ledger';

export const GET = publicGet(async (_event, db) => getLedger(db));
