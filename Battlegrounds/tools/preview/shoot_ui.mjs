// node shoot_ui.mjs <outdir> <json:bg>...   renders UI snapshots over backdrops
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [, , outDir, ...pairs] = process.argv;
const root = path.dirname(new URL(import.meta.url).pathname);
fs.mkdirSync(outDir, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = url.startsWith('/abs/') ? url.slice(4) : path.join(root, url === '/' ? 'ui.html' : url);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
for (const pair of pairs) {
  const [json, bg] = pair.split(':');
  const data = JSON.parse(fs.readFileSync(json, 'utf8'));
  const [w, h] = data.viewport;
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  const q = `json=/abs${encodeURIComponent(path.resolve(json))}` + (bg ? `&bg=/abs${encodeURIComponent(path.resolve(bg))}` : '');
  await page.goto(`http://127.0.0.1:${port}/ui.html?${q}`);
  await page.waitForFunction(() => window.uiReady === true, null, { timeout: 60000 });
  const out = path.join(outDir, path.basename(json, '.json') + '.png');
  await page.screenshot({ path: out });
  console.log('wrote', out);
  await page.close();
}
await browser.close();
server.close();
