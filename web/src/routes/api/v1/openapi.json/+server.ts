import type { RequestHandler } from '@sveltejs/kit';
import { etagOf, matchesEtag } from '$lib/server/http/respond';
import { getContractJson } from '$lib/server/openapi';

export const GET: RequestHandler = async ({ request }) => {
  const body = getContractJson();
  const etag = etagOf(body);
  if (matchesEtag(request, etag)) {
    return new Response(null, { status: 304, headers: { etag } });
  }
  return new Response(body, {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=15',
      etag
    }
  });
};
