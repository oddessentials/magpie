import { publicJson } from '$lib/server/http/respond';
import { catalog } from '$lib/server/read/catalog';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => publicJson(catalog, request);
