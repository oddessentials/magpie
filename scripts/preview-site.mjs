import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../site/', import.meta.url));
const port = Number(process.env.SITE_PORT ?? 5180);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2'
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
    if (!path.startsWith(resolve(root) + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const content = await readFile(path);
    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => console.log(`Magpie site: http://127.0.0.1:${port}`));
