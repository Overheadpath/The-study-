// End-to-end checks of the app in headless Chromium:  npm run test:browser
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
let server;
let browser;
let base;

before(async () => {
  server = createServer(async (req, res) => {
    try {
      let path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      if (!path.startsWith(root)) throw new Error('outside');
      if (path.endsWith('/')) path += 'index.html';
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(await readFile(path));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
  server.close();
});

async function openPage(hash = 'practice', viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  // Keep external font requests from slowing tests down.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.goto(`${base}#${hash}`);
  await page.waitForSelector('main .view');
  return { page, errors };
}

async function playRounds(page, rounds) {
  let done = 0;
  for (let guard = 0; guard < rounds * 12 && done < rounds; guard += 1) {
    if (await page.$('button.act-btn.deal')) {
      if (guard > 0) done += 1;
      if (done >= rounds) break;
      await page.keyboard.press('Enter');
    } else if (await page.$('button.act-btn.plain')) {
      await page.keyboard.press('n');
    } else {
      const keys = await page.$$eval('button.act-btn:not([disabled])', (bs) => bs.map((b) => b.querySelector('.kbd').textContent.toLowerCase()));
      await page.keyboard.press(keys[0]);
    }
  }
  return done;
}

test('practice: deal, decide by keyboard, get feedback, result and stats', async () => {
  const { page, errors } = await openPage('practice');
  await page.click('button.act-btn.deal');
  assert.equal(await page.$$eval('.felt .card', (c) => c.length) >= 4, true);
  const rounds = await playRounds(page, 8);
  assert.ok(rounds >= 8);
  const text = await page.textContent('main');
  assert.match(text, /Result after the dealer plays/);
  assert.match(text, /Round total/);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('blackjack-strategy-lab:v1')));
  assert.ok(stored.history.rounds.length >= 8);
  assert.deepEqual(errors, []);
  await page.close();
});

test('practice: feedback appears only after deciding, hints are not scored', async () => {
  const { page } = await openPage('practice');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // A pairs drill always needs a decision, unless the dealer or player has blackjack.
  await page.click('.seg button:has-text("Pairs")');
  for (let i = 0; i < 10; i += 1) {
    await page.click('button.act-btn.deal');
    if (await page.$('button.act-btn.plain')) await page.keyboard.press('n');
    if (await page.$('button.act-btn:not(.deal):not(.plain):not([disabled])')) break;
  }
  const cards = await page.$$eval('.hand-box.active .card', (els) => els.map((e) => e.getAttribute('aria-label').split(' ')[0]));
  assert.equal(cards.length, 2);
  assert.match(await page.textContent('main'), /Choose an action first/);
  await page.click('button:has-text("Show hint")');
  assert.match(await page.textContent('main'), /Hint shown/);
  const acts = await page.$$eval('button.act-btn:not([disabled])', (bs) => bs.map((b) => b.querySelector('.kbd').textContent.toLowerCase()));
  await page.keyboard.press(acts[0]);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('blackjack-strategy-lab:v1') || '{}'));
  const decisions = stored.history ? stored.history.decisions : [];
  assert.ok(decisions.every((d) => d.hinted || d.table === 'insurance'));
  await page.close();
});

test('analyze: typed hand shows the four analysis panels and the right play', async () => {
  const { page, errors } = await openPage('analyze');
  await page.fill('#hand-text', '10 6 vs 10');
  await page.click('form button[type=submit]');
  const text = await page.textContent('#analysis-results');
  for (const heading of ['Player hand', 'Dealer up card', 'Basic-strategy play', 'Probabilities and expected value']) assert.ok(text.includes(heading), heading);
  assert.match(text, /Surrender/);
  assert.match(text, /cannot predict/);
  await page.fill('#hand-text', 'A 7 vs 9');
  await page.click('form button[type=submit]');
  assert.match(await page.textContent('#analysis-results .big-rec'), /Hit/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('analyze: a sample screenshot is read and its cards feed the analysis', async () => {
  const { page, errors } = await openPage('analyze');
  const short = { Ace: 'A', King: 'K', Queen: 'Q', Jack: 'J' };
  const rankOf = (label) => {
    const word = label.split(' ')[0];
    return short[word] || word;
  };
  for (let i = 0; i < 3; i += 1) {
    await page.click('button:has-text("Try a sample screenshot")');
    await page.waitForSelector('.detect-item');
    const note = await page.textContent('p:has-text("The cards actually drawn were")');
    const [, playerText, upText] = note.match(/were (.+) vs (\S+)\.$/);
    await page.click('button:has-text("Use these cards")');
    const entered = await page.$$eval('.entry-hand .card', (els) => els.map((e) => e.getAttribute('aria-label')));
    const up = await page.getAttribute('.picker .row-wrap .card', 'aria-label');
    assert.deepEqual(entered.map(rankOf).sort(), playerText.split(', ').sort());
    assert.equal(rankOf(up), upText);
    assert.match(await page.textContent('#analysis-results'), /Basic-strategy play/);
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test('rules change the chart: H17 doubles 11 against an ace', async () => {
  const { page } = await openPage('rules');
  await page.click('.rule-card:has-text("Dealer on soft 17") button:has-text("Stands (S17)")');
  await page.goto(`${base}#chart`);
  const cell = () => page.getAttribute('table.strategy button[aria-label^="Hard 11 vs A"]', 'aria-label');
  assert.match(await cell(), /: H/);
  await page.goto(`${base}#rules`);
  await page.click('.rule-card:has-text("Dealer on soft 17") button:has-text("Hits (H17)")');
  await page.goto(`${base}#chart`);
  assert.match(await cell(), /: Dh/);
  await page.click('table.strategy button[aria-label^="Hard 16 vs 10"]');
  assert.match(await page.textContent('main'), /Why this cell/);
  await page.close();
});

test('learn: the independence simulation runs', async () => {
  const { page, errors } = await openPage('learn');
  await page.selectOption('#sim-n', '1000');
  await page.click('button:has-text("Run simulation")');
  await page.waitForSelector('text=won right after a loss');
  assert.deepEqual(errors, []);
  await page.close();
});

test('phone width: no horizontal scrolling on any view', async () => {
  const { page } = await openPage('practice', { width: 390, height: 844 });
  for (const view of ['practice', 'analyze', 'chart', 'stats', 'learn', 'rules']) {
    await page.goto(`${base}#${view}`);
    await page.waitForTimeout(100);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${view} overflows by ${overflow}px`);
  }
  await page.close();
});
