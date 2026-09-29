import type { RequestEvent } from '@sveltejs/kit';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { acceptsGzip, compress } from '../../../src/lib/server/hooks/compress';
import { matchesEtag, publicJson } from '../../../src/lib/server/http/respond';

async function run(
  response: Response,
  request: RequestInit & { url?: string } = { headers: { 'accept-encoding': 'gzip, br' } }
) {
  const event = { request: new Request(request.url ?? 'http://test/api/v1/catalog', request) };
  return compress({
    event: event as unknown as RequestEvent,
    resolve: async () => response
  });
}

const document = {
  items: Array.from({ length: 400 }, (_, index) => ({ index, name: 'Ash Logs' }))
};

describe('response compression', () => {
  it('reads the gzip preference from Accept-Encoding', () => {
    expect(acceptsGzip('gzip, deflate, br')).toBe(true);
    expect(acceptsGzip('br;q=1.0, gzip;q=0.8')).toBe(true);
    expect(acceptsGzip('*')).toBe(true);
    expect(acceptsGzip('gzip;q=0')).toBe(false);
    expect(acceptsGzip('br')).toBe(false);
    expect(acceptsGzip(null)).toBe(false);
  });

  it('gzips large JSON and HTML, keeps the body and weakens the ETag', async () => {
    const plain = publicJson(document);
    const etag = plain.headers.get('etag')!;
    const response = await run(publicJson(document));
    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(response.headers.get('vary')).toContain('Accept-Encoding');
    expect(response.headers.get('etag')).toBe(`W/${etag}`);
    const body = gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
    expect(JSON.parse(body)).toEqual(document);
    const html = await run(
      new Response('<p>wilds</p>'.repeat(200), { headers: { 'content-type': 'text/html' } })
    );
    expect(html.headers.get('content-encoding')).toBe('gzip');
  });

  it('leaves small bodies, other methods, streams and clients without gzip alone', async () => {
    const small = await run(Response.json({ ok: true }));
    expect(small.headers.get('content-encoding')).toBeNull();
    expect(await small.json()).toEqual({ ok: true });
    const identity = await run(publicJson(document), { headers: {} });
    expect(identity.headers.get('content-encoding')).toBeNull();
    expect(identity.headers.get('vary')).toContain('Accept-Encoding');
    const posted = await run(publicJson(document), {
      method: 'POST',
      body: '{}',
      headers: { 'accept-encoding': 'gzip' }
    });
    expect(posted.headers.get('content-encoding')).toBeNull();
    const stream = new Response('data: 1\n\n'.repeat(400), {
      headers: { 'content-type': 'text/event-stream' }
    });
    expect(await run(stream)).toBe(stream);
  });

  it('answers a revalidation with either form of the ETag', () => {
    const etag = '"abc"';
    const asking = (value: string) =>
      new Request('http://test/', { headers: { 'if-none-match': value } });
    expect(matchesEtag(asking('"abc"'), etag)).toBe(true);
    expect(matchesEtag(asking('W/"abc"'), etag)).toBe(true);
    expect(matchesEtag(asking('"other", W/"abc"'), etag)).toBe(true);
    expect(matchesEtag(asking('"other"'), etag)).toBe(false);
    expect(matchesEtag(undefined, etag)).toBe(false);
  });
});
