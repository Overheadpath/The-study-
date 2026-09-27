// Minimal static file server for the browser tests (ES modules don't load from file://).

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

export const BLANK_PAGE = '/__vision_blank__.html';

/** Serve `root` on a random localhost port. Resolves to { url, close }. */
export function startStaticServer(root) {
  const base = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === BLANK_PAGE) {
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      res.end('<!doctype html><html><head><meta charset="utf-8"><title>vision</title></head><body></body></html>');
      return;
    }
    const file = path.resolve(base, `.${pathname}`);
    if (!file.startsWith(base + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
