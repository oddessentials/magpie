import { publicJson } from '$lib/server/http/respond';
import { worldMap } from '$lib/server/read/map';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => publicJson(worldMap, request);
