import { errorResponse, factsJson } from '$lib/server/http/respond';
import { isLayerName, layerNames, mapLayer } from '$lib/server/read/layers';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, request }) =>
  isLayerName(params.layer)
    ? factsJson(mapLayer(params.layer), request)
    : errorResponse(404, 'not_found', `the map layers are ${layerNames.join(', ')}`);
