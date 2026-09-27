// Browser-side helpers for the card-recognition tests: random deals, image
// degradation (rescale + JPEG) and scoring detections against ground truth.

import { RANKS, SUITS } from '../../src/engine/cards.js';
import { detectCards } from '../../src/vision/detector.js';
import { renderSampleTable, createRng } from '../../src/vision/sample-table.js';

export function makeDeal(rng) {
  const card = () => ({ rank: RANKS[Math.floor(rng() * RANKS.length)], suit: SUITS[Math.floor(rng() * SUITS.length)] });
  const revealed = rng() < 0.2;
  const dealer = revealed ? Array.from({ length: 2 + Math.floor(rng() * 3) }, card) : [card(), card()];
  const hands = rng() < 0.3 ? 2 : 1;
  const playerHands = Array.from({ length: hands }, () => Array.from({ length: 2 + Math.floor(rng() * 4) }, card));
  return { dealer, holeCardHidden: !revealed, playerHands };
}

/** Rescale a canvas and optionally JPEG-recompress it; returns ImageData. */
export async function degrade(canvas, scale = 1, jpegQuality = 0) {
  const w = Math.round(canvas.width * scale);
  const h = Math.round(canvas.height * scale);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, w, h);
  if (jpegQuality) {
    const img = new Image();
    img.src = out.toDataURL('image/jpeg', jpegQuality);
    await img.decode();
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
  }
  return ctx.getImageData(0, 0, w, h);
}

const scaleBox = (b, s) => ({ x: b.x * s, y: b.y * s, w: b.w * s, h: b.h * s });

function overlapRatio(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (ix * iy) / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}

/** Match detections to the truth cards (by corner-index overlap) and count errors. */
export function scoreDetections(truthCards, result, scale = 1) {
  const truth = truthCards.map((t) => ({ ...t, indexBox: scaleBox(t.indexBox, scale) }));
  const pairs = [];
  truth.forEach((t, ti) => result.cards.forEach((d, di) => {
    const o = overlapRatio(t.indexBox, d.box);
    if (o > 0.3) pairs.push({ ti, di, o });
  }));
  pairs.sort((a, b) => b.o - a.o);
  const tUsed = new Map();
  const dUsed = new Set();
  for (const p of pairs) {
    if (tUsed.has(p.ti) || dUsed.has(p.di)) continue;
    tUsed.set(p.ti, p.di);
    dUsed.add(p.di);
  }
  const stats = { total: truth.length, found: 0, correct: 0, rankOk: 0, suitOk: 0, handOk: 0, spurious: 0, errors: [] };
  truth.forEach((t, ti) => {
    const di = tUsed.get(ti);
    const d = di === undefined ? null : result.cards[di];
    if (d) stats.found++;
    const rankOk = d && d.rank === t.rank;
    const ok = rankOk && d.role === t.role;
    if (rankOk) stats.rankOk++;
    if (ok) stats.correct++;
    if (d && d.suit === t.suit) stats.suitOk++;
    if (ok && d.handIndex === t.handIndex) stats.handOk++;
    if (!ok) {
      stats.errors.push({
        truth: `${t.rank}${t.suit} ${t.role}#${t.handIndex}`,
        got: d ? `${d.rank}${d.suit || '?'} ${d.role}#${d.handIndex} (${d.confidence})` : 'missed',
        box: t.indexBox,
      });
    }
  });
  result.cards.forEach((d, di) => {
    if (dUsed.has(di)) return;
    stats.spurious++;
    stats.errors.push({ truth: 'none', got: `${d.rank}${d.suit || '?'} ${d.role} (${d.confidence})`, box: d.box });
  });
  stats.confidences = result.cards.map((d, di) => {
    const ti = [...tUsed.entries()].find(([, v]) => v === di)?.[0];
    const t = ti === undefined ? null : truth[ti];
    return { confidence: d.confidence, ok: !!t && t.rank === d.rank && t.role === d.role, label: `${d.rank}${d.suit || ''}` };
  });
  return stats;
}

/**
 * Render `count` random tables per style, optionally rescale + JPEG them,
 * run detectCards and aggregate the scores.
 */
export async function runBatch({ styles, count, seed = 1, jpegQuality = 0, scaleRange = [1, 1], keepErrors = 20, overrides = null }) {
  const rng = createRng(seed);
  const canvas = document.createElement('canvas');
  const totals = { total: 0, correct: 0, rankOk: 0, suitOk: 0, handOk: 0, found: 0, spurious: 0, images: 0, ms: 0, maxMs: 0 };
  const perStyle = {};
  const errors = [];
  const confidences = [];
  for (const style of styles) {
    const ps = (perStyle[style] = { total: 0, correct: 0, spurious: 0 });
    for (let i = 0; i < count; i++) {
      const tableSeed = Math.floor(rng() * 1e9);
      const deal = makeDeal(createRng(tableSeed));
      const truth = renderSampleTable(canvas, { ...deal, style, seed: tableSeed, overrides });
      const scale = scaleRange[0] + rng() * (scaleRange[1] - scaleRange[0]);
      const imageData = await degrade(canvas, scale, jpegQuality);
      const t0 = performance.now();
      const result = detectCards(imageData);
      const ms = performance.now() - t0;
      const s = scoreDetections(truth.cards, result, imageData.width / canvas.width);
      for (const k of ['total', 'correct', 'rankOk', 'suitOk', 'handOk', 'found', 'spurious']) totals[k] += s[k];
      totals.images++;
      totals.ms += ms;
      totals.maxMs = Math.max(totals.maxMs, ms);
      ps.total += s.total;
      ps.correct += s.correct;
      ps.spurious += s.spurious;
      confidences.push(...s.confidences.map((c) => ({ ...c, style, seed: tableSeed, scale: Number(scale.toFixed(3)) })));
      if (s.errors.length && errors.length < keepErrors) {
        errors.push({ style, seed: tableSeed, scale, jpegQuality, deal, errors: s.errors, notes: result.notes });
      }
    }
  }
  return { totals, perStyle, errors, confidences };
}
