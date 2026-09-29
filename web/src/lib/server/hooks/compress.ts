import type { Handle } from '@sveltejs/kit';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const gzipAsync = promisify(gzip);
const compressible = /^(text\/html|application\/json)\b/;

export const smallestCompressed = 1024;

export function acceptsGzip(header: string | null): boolean {
  if (!header) return false;
  return header.split(',').some((part) => {
    const [coding, ...parameters] = part.split(';').map((piece) => piece.trim().toLowerCase());
    if (coding !== 'gzip' && coding !== '*') return false;
    const quality = parameters.find((parameter) => parameter.startsWith('q='));
    return quality === undefined || Number(quality.slice(2)) > 0;
  });
}

export const compress: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  if (
    event.request.method !== 'GET' ||
    response.status !== 200 ||
    !response.body ||
    response.headers.has('content-encoding') ||
    !compressible.test(response.headers.get('content-type') ?? '')
  ) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.append('vary', 'Accept-Encoding');
  const body = Buffer.from(await response.arrayBuffer());
  if (
    body.length < smallestCompressed ||
    !acceptsGzip(event.request.headers.get('accept-encoding'))
  ) {
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
  const packed = await gzipAsync(body);
  const etag = headers.get('etag');
  if (etag && !etag.startsWith('W/')) headers.set('etag', `W/${etag}`);
  headers.set('content-encoding', 'gzip');
  headers.set('content-length', String(packed.length));
  return new Response(packed, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};
