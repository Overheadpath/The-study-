// Screenshot card-recognition tests: render synthetic tables in headless
// Chromium, run the detector and check accuracy, roles, notes and speed.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startStaticServer, BLANK_PAGE } from './vision-server.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let server;
let browser;
let page;

before(async () => {
  server = await startStaticServer(ROOT);
  browser = await chromium.launch();
  page = await browser.newPage();
  page.on('pageerror', (err) => console.error('page error:', err.message));
  await page.goto(server.url + BLANK_PAGE);
});

after(async () => {
  await browser?.close();
  await server?.close();
});

const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;

function summarize(t, name, res) {
  const s = res.totals;
  t.diagnostic(`${name}: ${s.images} images, ${s.total} cards, rank+role ${pct(s.correct, s.total)}, suit ${pct(s.suitOk, s.total)}, `
    + `hand ${pct(s.handOk, s.total)}, spurious ${s.spurious} (${pct(s.spurious, s.total)}), avg ${(s.ms / s.images).toFixed(0)} ms, max ${s.maxMs.toFixed(0)} ms`);
  for (const [style, v] of Object.entries(res.perStyle)) t.diagnostic(`  ${style.padEnd(9)} ${pct(v.correct, v.total)} of ${v.total}, spurious ${v.spurious}`);
  for (const e of res.errors.slice(0, 8)) {
    t.diagnostic(`  miss: ${e.style} seed=${e.seed} scale=${e.scale.toFixed(3)}: ${e.errors.map((x) => `${x.truth} -> ${x.got}`).join('; ')}`);
  }
}

function runBatch(options) {
  return page.evaluate(async (opts) => {
    const harness = await import('/tests/browser/vision-harness.js');
    const { SAMPLE_STYLES } = await import('/src/vision/sample-table.js');
    return harness.runBatch({ styles: SAMPLE_STYLES, ...opts });
  }, options);
}

test('reads clean renders of every sample style', async (t) => {
  const res = await runBatch({ count: 10, seed: 101 });
  summarize(t, 'clean PNG', res);
  const s = res.totals;
  assert.ok(s.correct / s.total >= 0.97, `rank+role accuracy ${pct(s.correct, s.total)} < 97%`);
  assert.ok(s.spurious / s.total <= 0.02, `spurious detections ${pct(s.spurious, s.total)} > 2%`);
  assert.ok(s.handOk / s.total >= 0.95, `hand grouping ${pct(s.handOk, s.total)} < 95%`);
});

test('reads JPEG-compressed, rescaled screenshots (0.6x - 1.5x)', async (t) => {
  const res = await runBatch({ count: 10, seed: 202, jpegQuality: 0.7, scaleRange: [0.6, 1.5] });
  summarize(t, 'JPEG q0.7 + rescale', res);
  const s = res.totals;
  assert.ok(s.correct / s.total >= 0.9, `rank+role accuracy ${pct(s.correct, s.total)} < 90%`);
  assert.ok(s.spurious / s.total <= 0.02, `spurious detections ${pct(s.spurious, s.total)} > 2%`);
});

test('high-confidence readings are reliable', async () => {
  const res = await runBatch({ count: 6, seed: 303, jpegQuality: 0.7, scaleRange: [0.6, 1.5] });
  const confident = res.confidences.filter((c) => c.confidence >= 0.8);
  const wrong = confident.filter((c) => !c.ok).length;
  assert.ok(confident.length > 0.8 * res.confidences.length, 'most cards should be read with confidence >= 0.8');
  assert.ok(wrong / confident.length <= 0.01, `${wrong} of ${confident.length} confident readings were wrong`);
});

test('decks with the suit beside the rank, or no suit in the corner, are still read', async (t) => {
  const row = await runBatch({ count: 3, seed: 404, jpegQuality: 0.8, scaleRange: [0.8, 1.2], overrides: { indexLayout: 'row' } });
  summarize(t, 'suit beside rank', row);
  assert.ok(row.totals.correct / row.totals.total >= 0.9, `row layout accuracy ${pct(row.totals.correct, row.totals.total)}`);
  assert.ok(row.totals.spurious / row.totals.total <= 0.03);
  const bare = await runBatch({ count: 3, seed: 505, jpegQuality: 0.8, scaleRange: [0.8, 1.2], overrides: { indexLayout: 'rank' } });
  summarize(t, 'rank only', bare);
  assert.ok(bare.totals.correct / bare.totals.total >= 0.85, `rank-only accuracy ${pct(bare.totals.correct, bare.totals.total)}`);
  assert.ok(bare.totals.spurious / bare.totals.total <= 0.03);
  // Rank-only readings are flagged for checking.
  assert.ok(bare.confidences.every((c) => c.confidence <= 0.6));
});

test('cards dimmed behind a pop-up dialog are still read', async (t) => {
  const res = await runBatch({ count: 3, seed: 606, jpegQuality: 0.8, scaleRange: [0.8, 1.2], overrides: { dialog: 'INSURANCE?' } });
  summarize(t, 'dimmed by dialog', res);
  assert.ok(res.totals.correct / res.totals.total >= 0.9, `dimmed accuracy ${pct(res.totals.correct, res.totals.total)}`);
  assert.ok(res.totals.spurious / res.totals.total <= 0.03, 'dialog text must not become cards');
});

test('text, charts and UI elements are not mistaken for cards', async () => {
  const res = await page.evaluate(async () => {
    const { detectCards } = await import('/src/vision/detector.js');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const read = () => detectCards(ctx.getImageData(0, 0, canvas.width, canvas.height)).cards.map((c) => c.rank);
    const out = {};
    // A rules panel with ranks and suit symbols in running text.
    canvas.width = 1280;
    canvas.height = 720;
    ctx.fillStyle = '#123';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#fff';
    ctx.fillRect(200, 100, 880, 520);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillText('BLACKJACK RULES', 240, 170);
    ctx.font = '22px Georgia, serif';
    ['Dealer stands on soft 17. Blackjack pays 3 to 2.', 'A counts 1 or 11; K, Q and J count 10.', '2 3 4 5 6 7 8 9 10 J Q K A', 'Hand history: A\u2660 K\u2665  10\u2666 6\u2663']
      .forEach((line, i) => ctx.fillText(line, 240, 240 + i * 60));
    out.rules = read();
    // A basic-strategy chart: coloured cells with dark labels.
    canvas.width = 1000;
    canvas.height = 700;
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(0, 0, 1000, 700);
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const heads = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
    for (let j = -1; j < 14; j++) {
      for (let i = -1; i < 10; i++) {
        ctx.fillStyle = i < 0 || j < 0 ? '#dddddd' : ['#e57373', '#fff59d', '#81c784', '#64b5f6'][(i * 7 + j * 3) % 4];
        ctx.fillRect(100 + i * 80, 64 + j * 44, 76, 40);
        ctx.fillStyle = '#222';
        const label = j < 0 ? (heads[i] || '') : i < 0 ? String(8 + j) : 'HSDP'[(i * 7 + j * 3) % 4];
        ctx.fillText(label, 138 + i * 80, 84 + j * 44);
      }
    }
    out.chart = read();
    return out;
  });
  assert.deepEqual(res.rules, []);
  assert.deepEqual(res.chart, []);
});

test('an image without face-up cards returns no cards and a note', async () => {
  const res = await page.evaluate(async () => {
    const { detectCards } = await import('/src/vision/detector.js');
    const { renderSampleTable } = await import('/src/vision/sample-table.js');
    const canvas = document.createElement('canvas');
    // Only a face-down card, the shoe, chips and buttons.
    renderSampleTable(canvas, { dealer: [], playerHands: [], style: 'classic', seed: 5 });
    const ctx = canvas.getContext('2d');
    const table = detectCards(ctx.getImageData(0, 0, canvas.width, canvas.height));
    // A plain photo-like gradient with noise.
    canvas.width = 640;
    canvas.height = 480;
    const g = ctx.createLinearGradient(0, 0, 640, 480);
    g.addColorStop(0, '#f2efe6');
    g.addColorStop(1, '#3b5b7a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 640, 480);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `hsl(${(i * 37) % 360}, 40%, ${20 + (i % 60)}%)`;
      ctx.fillRect((i * 97) % 640, (i * 53) % 480, 6, 4);
    }
    const noise = detectCards(ctx.getImageData(0, 0, 640, 480));
    return { table, noise };
  });
  for (const r of [res.table, res.noise]) {
    assert.equal(r.cards.length, 0, `expected no cards, got ${r.cards.map((c) => c.rank).join(',')}`);
    assert.equal(r.dealerUpCard, null);
    assert.deepEqual(r.playerHands, []);
    assert.ok(r.notes.length >= 1 && /no cards/i.test(r.notes[0]), 'should explain that no cards were found');
  }
});

test('a single group of cards is assigned to the player with a note', async () => {
  const res = await page.evaluate(async () => {
    const { detectCards } = await import('/src/vision/detector.js');
    const { renderSampleTable } = await import('/src/vision/sample-table.js');
    const canvas = document.createElement('canvas');
    renderSampleTable(canvas, {
      dealer: [],
      holeCardHidden: false,
      playerHands: [[{ rank: '8', suit: 'S' }, { rank: '8', suit: 'D' }, { rank: '3', suit: 'C' }]],
      style: 'modern',
      seed: 9,
    });
    return detectCards(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height));
  });
  assert.deepEqual(res.cards.map((c) => c.rank), ['8', '8', '3']);
  assert.ok(res.cards.every((c) => c.role === 'player' && c.handIndex === 0));
  assert.equal(res.dealerUpCard, null);
  assert.equal(res.playerHands.length, 1);
  assert.ok(res.notes.some((n) => /only one group/i.test(n)), `missing single-group note: ${res.notes.join(' | ')}`);
});

test('dealer, split hands and boxes are reported in original pixels', async () => {
  const res = await page.evaluate(async () => {
    const { readCardsFromImage } = await import('/src/vision/detector.js');
    const { renderSampleTable } = await import('/src/vision/sample-table.js');
    const canvas = document.createElement('canvas');
    const truth = renderSampleTable(canvas, {
      dealer: [{ rank: '6', suit: 'H' }, { rank: 'K', suit: 'S' }],
      playerHands: [[{ rank: '8', suit: 'C' }, { rank: '3', suit: 'D' }], [{ rank: '8', suit: 'H' }, { rank: 'A', suit: 'S' }, { rank: '10', suit: 'C' }]],
      style: 'classic',
      width: 1600,
      height: 900,
      seed: 21,
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const fromBlob = await readCardsFromImage(blob);
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    const fromImage = await readCardsFromImage(img);
    const fromCanvas = await readCardsFromImage(canvas);
    // Force the internal downscale path: boxes must still be in original pixels.
    const scaled = await readCardsFromImage(canvas, { maxPixels: 400000 });
    return { truth, fromBlob, fromImage, fromCanvas, scaled };
  });
  const { truth } = res;
  for (const r of [res.fromBlob, res.fromImage, res.fromCanvas, res.scaled]) {
    assert.equal(r.width, 1600);
    assert.equal(r.height, 900);
    assert.equal(r.dealerUpCard?.rank, '6');
    assert.equal(r.dealerUpCard?.role, 'dealer');
    assert.deepEqual(r.playerHands.map((h) => h.map((c) => c.rank)), [['8', '3'], ['8', 'A', '10']]);
    assert.deepEqual(r.playerHands.map((h) => h.map((c) => c.handIndex)), [[0, 0], [1, 1, 1]]);
    assert.ok(typeof r.timingMs === 'number');
  }
  // Every reported box covers the true corner index.
  for (const r of [res.fromBlob, res.scaled]) {
    const fullSize = r === res.fromBlob;
    for (const card of r.cards) {
      const t = truth.cards.find((c) => Math.abs(c.indexBox.x - card.box.x) < 12 && Math.abs(c.indexBox.y - card.box.y) < 12);
      assert.ok(t, `no truth card near box ${JSON.stringify(card.box)}`);
      const cx = t.indexBox.x + t.indexBox.w / 2;
      const cy = t.indexBox.y + t.indexBox.h / 2;
      assert.ok(cx > card.box.x && cx < card.box.x + card.box.w && cy > card.box.y && cy < card.box.y + card.box.h, 'box misses the index');
      assert.equal(card.rank, t.rank);
      assert.equal(card.color, t.suit === 'H' || t.suit === 'D' ? 'red' : 'black');
      // Small suits may be reported as unknown (null) when downscaled, never as a wrong suit.
      if (fullSize) assert.equal(card.suit, t.suit);
      else assert.ok(card.suit === null || card.suit === t.suit, `suit ${card.suit} for ${t.rank}${t.suit}`);
    }
  }
});

test('a 1920x1080 screenshot is read within 1.5 s (cold start, incl. templates)', async (t) => {
  const fresh = await browser.newPage();
  try {
    await fresh.goto(server.url + BLANK_PAGE);
    const res = await fresh.evaluate(async () => {
      const { renderSampleTable } = await import('/src/vision/sample-table.js');
      const canvas = document.createElement('canvas');
      renderSampleTable(canvas, {
        dealer: [{ rank: 'Q', suit: 'D' }],
        playerHands: [[{ rank: '9', suit: 'S' }, { rank: '2', suit: 'H' }, { rank: 'A', suit: 'C' }], [{ rank: '9', suit: 'D' }, { rank: '10', suit: 'H' }]],
        style: 'midnight',
        width: 1920,
        height: 1080,
        seed: 77,
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      const { readCardsFromImage } = await import('/src/vision/detector.js');
      const t0 = performance.now();
      const first = await readCardsFromImage(blob);
      const cold = performance.now() - t0;
      const t1 = performance.now();
      await readCardsFromImage(blob);
      const warm = performance.now() - t1;
      return { cold, warm, ranks: first.cards.map((c) => c.rank) };
    });
    t.diagnostic(`1920x1080: cold ${res.cold.toFixed(0)} ms, warm ${res.warm.toFixed(0)} ms`);
    assert.deepEqual(res.ranks, ['Q', '9', '2', 'A', '9', '10']);
    assert.ok(res.cold < 1500, `cold read took ${res.cold.toFixed(0)} ms`);
  } finally {
    await fresh.close();
  }
});
