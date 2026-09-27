// node shoot.mjs <preview.json> <outdir> [viewName ...]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [, , jsonPath, outDir, ...only] = process.argv;
const root = path.dirname(new URL(import.meta.url).pathname);
fs.mkdirSync(outDir, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = url === '/data/preview.json' ? jsonPath : path.join(root, url === '/' ? 'index.html' : url);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(0);
const port = server.address().port;

// Hub origin is (0, 100, 0).
const Y = 100;
const v = (name, pos, target, extra = {}) => ({ name, pos: [pos[0], pos[1] + Y, pos[2]], target: [target[0], target[1] + Y, target[2]], ...extra });
const A = (i) => 1600 + (i + 1) * 700; // map previews are spread out on X
const views = [
  v('01_north_shop', [0, 9, 20], [0, 15, -64]),
  v('02_west_rankings', [20, 9, 0], [-64, 15, 0]),
  v('03_south_arena', [0, 9, -20], [0, 15, 64]),
  v('04_east_featured', [-20, 9, 0], [64, 15, 0]),
  v('05_overview', [0, 160, 125], [0, 0, -5], { hideCeiling: true, lights: 8, fov: 55 }),
  v('06_wheel', [22, 11, -20], [50, 15, -50]),
  v('07_shop_hall', [0, 8, -56], [0, 7, -108]),
  v('08_rankings_hall', [-56, 8, 0], [-108, 11, 0]),
  v('09_arena_hall', [0, 8, 56], [0, 9, 108]),
  v('10_afk', [34, 6, -63], [34, 5, -90]),
  v('11_northwest', [-8, 9, -14], [-40, 8, -50]),
  v('12_southwest_sensei', [-22, 9, 22], [-50, 8, 50]),
  v('17_southeast_training', [20, 9, 20], [48, 10, 48]),
  { name: '13_arena_city', pos: [A(0) + 130, 90 + Y, 130], target: [A(0), Y, 0], sky: 0x8fb0d8, lights: 6 },
  { name: '14_arena_volcano', pos: [A(1) + 140, 80 + Y, 140], target: [A(1), Y, 0], sky: 0x3a1a14, lights: 6 },
  { name: '15_arena_dojo', pos: [A(2) + 140, 70 + Y, 140], target: [A(2), Y - 10, 0], sky: 0xa8d0f0, lights: 6 },
  { name: '16_training', pos: [70, Y + 50, 900 + 90], target: [0, Y, 900], sky: 0x9cb8d6, lights: 6 },
];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const PW = +(process.env.W || 1280), PH = +(process.env.H || 720);
const page = await browser.newPage({ viewport: { width: PW, height: PH } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/?w=${PW}&h=${PH}`);
await page.waitForFunction(() => window.previewReady === true, null, { timeout: 180000 });
for (const view of views) {
  if (only.length && !only.some((o) => view.name.includes(o))) continue;
  const t0 = Date.now();
  await page.evaluate((vw) => window.renderView(vw), view);
  await page.screenshot({ path: path.join(outDir, `${view.name}.png`) });
  console.log(`${view.name} ${Date.now() - t0}ms`);
}
await browser.close();
server.close();
