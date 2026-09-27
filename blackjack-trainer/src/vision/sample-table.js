// Draws a synthetic blackjack table "screenshot" on a canvas. Used by the
// "Try a sample screenshot" button and by the card-recognition tests.
// Everything is drawn with local fonts and vector shapes (no network assets).

import { RANKS, SUITS, isRed, rankValue } from '../engine/cards.js';
import { drawSuit, SUIT_ASPECT, SUIT_VARIANTS } from './suits.js';

const BASE_W = 1280;
const BASE_H = 720;

// Layout is authored for a 1280x720 table and scaled to the requested size.
const STYLES = {
  classic: {
    felt: ['#1d8a4d', '#06391c'], noise: 0.07, print: 'rgba(247, 222, 150, 0.8)',
    card: { w: 104, h: 146, r: 8, face: '#ffffff', edge: '#a3a3a3', shadow: 'rgba(0, 0, 0, 0.45)', blur: 8, sx: 2, sy: 3 },
    font: { family: 'Georgia, "DejaVu Serif", "Times New Roman", serif', weight: 'bold', size: 26, scaleX: 0.9, tenScaleX: 0.72 },
    index: { cx: 15, top: 7, suit: 16, gap: 4 }, suitVariant: 'classic',
    fan: { dx: 36, dy: -5 }, red: '#c8102e', black: '#141414',
    back: { base: '#a01d2e', line: '#f0c9cf', border: '#ffffff', pattern: 'lattice' },
    court: 'figure', pips: 'standard', buttons: 'dark', tilt: 0,
  },
  modern: {
    felt: ['#1a4f96', '#061a3d'], noise: 0.03, print: 'rgba(175, 205, 255, 0.6)',
    card: { w: 106, h: 148, r: 10, face: '#ffffff', edge: null, shadow: 'rgba(0, 0, 0, 0.55)', blur: 12, sx: 0, sy: 4 },
    font: { family: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: 'bold', size: 30, scaleX: 0.85, tenScaleX: 0.7 },
    index: { cx: 17, top: 8, suit: 18, gap: 5 }, suitVariant: 'round',
    fan: { dx: 40, dy: 0 }, red: '#e53935', black: '#1c1c1c',
    back: { base: '#1e40af', line: '#9db4f5', border: '#ffffff', pattern: 'dots' },
    court: 'letter', pips: 'standard', buttons: 'light', tilt: 0,
  },
  vegas: {
    felt: ['#9a1f28', '#3a060b'], noise: 0.06, print: 'rgba(255, 214, 120, 0.75)',
    card: { w: 100, h: 140, r: 6, face: '#fbf7ec', edge: '#7d7466', shadow: 'rgba(0, 0, 0, 0.4)', blur: 5, sx: 2, sy: 2 },
    font: { family: '"Book Antiqua", Palatino, FreeSerif, "Times New Roman", serif', weight: 'normal', size: 27, scaleX: 1, tenScaleX: 0.78 },
    index: { cx: 14, top: 5, suit: 15, gap: 3 }, suitVariant: 'sharp',
    fan: { dx: 34, dy: 6 }, red: '#b3001b', black: '#000000',
    back: { base: '#23305e', line: '#c7cff0', border: '#fbf7ec', pattern: 'lattice' },
    court: 'figure', pips: 'standard', buttons: 'dark', tilt: 1.5,
  },
  midnight: {
    felt: ['#243044', '#06080c'], noise: 0.04, print: 'rgba(120, 222, 255, 0.5)',
    card: { w: 108, h: 150, r: 9, face: '#f6f8fb', face2: '#dfe5ee', edge: '#c3ccda', shadow: 'rgba(0, 0, 0, 0.7)', blur: 14, sx: 3, sy: 5 },
    font: { family: 'Verdana, "DejaVu Sans", sans-serif', weight: 'bold', size: 26, scaleX: 0.82, tenScaleX: 0.66 },
    index: { cx: 16, top: 8, suit: 17, gap: 4 }, suitVariant: 'classic',
    fan: { dx: 42, dy: -8 }, red: '#f0294e', black: '#10131a',
    back: { base: '#5b21b6', line: '#c4b5fd', border: '#f4f6fa', pattern: 'diamonds' },
    court: 'letter', pips: 'standard', buttons: 'neon', tilt: 0,
  },
  mobile: {
    felt: ['#13857b', '#043a35'], noise: 0.02, print: 'rgba(210, 255, 245, 0.45)',
    card: { w: 92, h: 128, r: 12, face: '#ffffff', edge: null, shadow: 'rgba(0, 0, 0, 0.35)', blur: 10, sx: 0, sy: 3 },
    font: { family: '"Segoe UI", Roboto, "Helvetica Neue", FreeSans, Arial, sans-serif', weight: 'bold', size: 32, scaleX: 0.8, tenScaleX: 0.66 },
    index: { cx: 17, top: 6, suit: 19, gap: 4 }, suitVariant: 'round',
    fan: { dx: 44, dy: 0 }, red: '#ef3340', black: '#202124',
    back: { base: '#ea580c', line: '#ffd7b5', border: '#ffffff', pattern: 'stripes' },
    court: 'plain', pips: 'plain', buttons: 'light', tilt: 0, cornerIndexOnly: true,
  },
  retro: {
    felt: ['#4b6b30', '#1b2a10'], noise: 0.1, print: 'rgba(240, 230, 190, 0.65)',
    card: { w: 100, h: 140, r: 5, face: '#fdf6e3', face2: '#f3e9cf', edge: '#3a3a3a', shadow: 'rgba(0, 0, 0, 0.3)', blur: 3, sx: 2, sy: 2 },
    font: { family: '"Courier New", Courier, monospace', weight: 'bold', size: 28, scaleX: 0.85, tenScaleX: 0.6 },
    index: { cx: 15, top: 6, suit: 16, gap: 2 }, suitVariant: 'sharp',
    fan: { dx: 38, dy: 4 }, red: '#b22222', black: '#222222',
    back: { base: '#7c2d12', line: '#f3c9a8', border: '#fdf6e3', pattern: 'lattice' },
    court: 'figure', pips: 'standard', buttons: 'dark', tilt: 1.2,
  },
  minimal: {
    felt: ['#35595a', '#172b2c'], noise: 0, print: 'rgba(255, 255, 255, 0.35)',
    card: { w: 96, h: 134, r: 8, face: '#ffffff', edge: '#d0d0d0', shadow: 'rgba(0, 0, 0, 0.25)', blur: 6, sx: 0, sy: 2 },
    font: { family: '"Trebuchet MS", Loma, sans-serif', weight: 'bold', size: 25, scaleX: 0.95, tenScaleX: 0.78 },
    index: { cx: 14, top: 6, suit: 15, gap: 4 }, suitVariant: 'round',
    fan: { dx: 104, dy: 0 }, red: '#d32f2f', black: '#263238',
    back: { base: '#37474f', line: '#90a4ae', border: '#ffffff', pattern: 'dots' },
    court: 'letter', pips: 'standard', buttons: 'light', tilt: 0,
  },
  parlor: {
    felt: ['#5a2a72', '#1c0826'], noise: 0.05, print: 'rgba(236, 200, 255, 0.55)',
    card: { w: 104, h: 146, r: 7, face: '#fffdf7', edge: '#b8a88a', shadow: 'rgba(0, 0, 0, 0.5)', blur: 9, sx: 2, sy: 4 },
    font: { family: '"Palatino Linotype", Palatino, "Times New Roman", serif', weight: 'bold', size: 28, scaleX: 0.78, tenScaleX: 0.64 },
    index: { cx: 15, top: 6, suit: 16, gap: 3 }, suitVariant: 'classic',
    fan: { dx: 37, dy: -3 }, red: '#b8002e', black: '#1b1b1b',
    back: { base: '#14532d', line: '#bbf7d0', border: '#fffdf7', pattern: 'diamonds' },
    court: 'figure', pips: 'standard', buttons: 'dark', tilt: 1,
  },
};

export const SAMPLE_STYLES = Object.keys(STYLES);

const PIP_LAYOUTS = {
  2: [[0.5, 0], [0.5, 1]],
  3: [[0.5, 0], [0.5, 0.5], [0.5, 1]],
  4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  5: [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]],
  6: [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  7: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  8: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]],
  9: [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [0.5, 0.5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
  10: [[0, 0], [1, 0], [0.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [0.5, 5 / 6], [0, 1], [1, 1]],
};

/** Deterministic PRNG so the same seed always draws the same table. */
export function createRng(seed = 1) {
  let a = (Number(seed) || 0) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random, plausible deal: dealer up card (+ hole card) and one or two player hands. */
export function randomDeal(seed = Date.now()) {
  const rng = createRng(seed);
  const draw = () => ({ rank: RANKS[Math.floor(rng() * RANKS.length)], suit: SUITS[Math.floor(rng() * SUITS.length)] });
  const dealer = [draw(), draw()];
  const handCount = rng() < 0.25 ? 2 : 1;
  const playerHands = [];
  for (let h = 0; h < handCount; h++) {
    const size = 2 + (rng() < 0.3 ? 1 : 0);
    playerHands.push(Array.from({ length: size }, draw));
  }
  return { dealer, holeCardHidden: true, playerHands };
}

/**
 * Render a table screenshot. Returns the ground truth: every face-up card with
 * its role, hand index, card box and corner-index box in canvas pixels.
 * `jitter` (default on) varies sizes and offsets a little per seed;
 * `overrides` patches the style (e.g. { tilt: 4, font: { family: 'serif' } }).
 */
export function renderSampleTable(canvas, options = {}) {
  const {
    dealer = [{ rank: '10', suit: 'S' }, { rank: '6', suit: 'D' }],
    holeCardHidden = true,
    playerHands = [[{ rank: 'A', suit: 'H' }, { rank: '7', suit: 'C' }]],
    style = 'classic',
    width = BASE_W,
    height = BASE_H,
    seed = 1,
    jitter = true,
    overrides = null,
  } = options;
  const name = STYLES[style] ? style : 'classic';
  const rng = createRng(seed);
  const S = mergeStyle(resolveStyle(STYLES[name], jitter ? rng : null), overrides);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const scale = Math.min(width / BASE_W, height / BASE_H);
  const ox = (width - BASE_W * scale) / 2;
  const oy = (height - BASE_H * scale) / 2;
  const toCanvas = (b) => ({ x: ox + b.x * scale, y: oy + b.y * scale, w: b.w * scale, h: b.h * scale });

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawFelt(ctx, width, height, S, rng);
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  const metrics = measureIndex(ctx, S);
  drawTablePrint(ctx, S);
  drawShoe(ctx, S);
  drawTopBar(ctx, S, 1 + Math.floor(rng() * 40));

  const dealerCards = dealer.map((c, i) => ({ ...c, faceDown: holeCardHidden && i === 1 }));
  if (holeCardHidden && dealerCards.length < 2) dealerCards.push({ rank: null, suit: null, faceDown: true });

  const truth = [];
  const place = (cards, role, handIndex, cx, top, fan) => {
    const { w, h } = S.card;
    const n = cards.length;
    const x0 = cx - (w + (n - 1) * fan.dx) / 2;
    const y0 = fan.dy < 0 ? top + (n - 1) * -fan.dy : top;
    cards.forEach((card, i) => {
      const x = x0 + i * fan.dx;
      const y = y0 + i * fan.dy;
      const angle = S.tilt ? ((rng() * 2 - 1) * S.tilt * Math.PI) / 180 : 0;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(angle);
      if (card.faceDown) {
        drawBack(ctx, -w / 2, -h / 2, S);
      } else {
        const local = drawCardFace(ctx, card, -w / 2, -h / 2, S, metrics);
        truth.push({
          rank: card.rank, suit: card.suit, role, handIndex, position: i,
          box: toCanvas(rotateBox({ x: -w / 2, y: -h / 2, w, h }, angle, x + w / 2, y + h / 2)),
          indexBox: toCanvas(rotateBox(local, angle, x + w / 2, y + h / 2)),
        });
      }
      ctx.restore();
    });
    return { x: x0, y: top, w: w + (n - 1) * fan.dx, h: h + (n - 1) * Math.abs(fan.dy) };
  };

  const fan = { ...S.fan, dx: Math.max(S.fan.dx, metrics.right + 6) };
  const dealerBox = place(dealerCards, 'dealer', 0, BASE_W / 2, 62, fan);
  const visibleDealer = dealerCards.filter((c) => !c.faceDown);
  drawTotalBubble(ctx, dealerBox.x - 14, dealerBox.y + dealerBox.h / 2, handLabel(visibleDealer), 'right');

  const hands = playerHands.length ? playerHands : [];
  const handWidth = (n) => S.card.w + (n - 1) * fan.dx;
  let widest = Math.max(0, ...hands.map((hnd) => handWidth(hnd.length)));
  if (hands.length * widest + (hands.length - 1) * 60 > 1200 && fan.dx > metrics.right + 8) {
    fan.dx = Math.max(metrics.right + 8, fan.dx * 0.6);
    widest = Math.max(0, ...hands.map((hnd) => handWidth(hnd.length)));
  }
  const gap = Math.max(40, Math.min(90, (1200 - hands.length * widest) / Math.max(1, hands.length - 1)));
  const spacing = widest + gap;
  hands.forEach((hand, h) => {
    const cx = BASE_W / 2 + (h - (hands.length - 1) / 2) * spacing;
    const box = place(hand.map((c) => ({ ...c, faceDown: false })), 'player', h, cx, 328, fan);
    drawTotalBubble(ctx, box.x - 12, box.y + box.h / 2, handLabel(hand), 'right');
    drawChipSpot(ctx, cx, Math.min(box.y + box.h + 58, 600), S, rng);
  });

  drawButtons(ctx, S, hands);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { width, height, style: name, cards: truth };
}

function resolveStyle(base, rng) {
  const S = JSON.parse(JSON.stringify(base));
  if (!rng) return S;
  const j = (amount) => 1 + (rng() * 2 - 1) * amount;
  const k = j(0.05);
  const sideBySide = base.fan.dx >= base.card.w;
  S.card.w = Math.round(base.card.w * k);
  S.card.h = Math.round(base.card.h * k * j(0.02));
  S.font.size = Math.round(base.font.size * j(0.07));
  S.font.scaleX = Math.min(1.05, base.font.scaleX * j(0.05));
  S.font.tenScaleX = base.font.tenScaleX * j(0.05);
  S.index.cx = base.index.cx + (rng() * 2 - 1) * 1.5;
  S.index.top = base.index.top + (rng() * 2 - 1) * 1.5;
  S.index.suit = base.index.suit * j(0.08);
  S.index.gap = Math.max(1, base.index.gap + (rng() * 2 - 1) * 1.2);
  S.fan.dx = sideBySide ? S.card.w + (base.fan.dx - base.card.w) * j(0.4) : base.fan.dx * j(0.1);
  S.fan.dy = base.fan.dy + (sideBySide ? 0 : (rng() * 2 - 1) * 2);
  S.suitVariant = SUIT_VARIANTS[Math.floor(rng() * SUIT_VARIANTS.length)];
  return S;
}

// Deep-merge style overrides (used by tests to vary fonts, tilt, sizes...).
function mergeStyle(S, overrides) {
  if (!overrides) return S;
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && S[key] && typeof S[key] === 'object') {
      S[key] = { ...S[key], ...value };
    } else {
      S[key] = value;
    }
  }
  return S;
}

// Axis-aligned bounds of box b after rotating it by `angle` and moving it to (cx, cy).
function rotateBox(b, angle, cx, cy) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const xs = [];
  const ys = [];
  for (const [px, py] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
    xs.push(cx + px * c - py * s);
    ys.push(cy + px * s + py * c);
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fontOf(S, size = S.font.size) {
  return `${S.font.weight} ${size}px ${S.font.family}`;
}

const rowIndexLeft = (S) => Math.max(4, S.index.cx - 9);

// Widest corner index for this style, used to keep pips and fans clear of it.
function measureIndex(ctx, S) {
  ctx.save();
  ctx.font = fontOf(S);
  let width = 0;
  for (const rank of RANKS) {
    const m = ctx.measureText(rank);
    const sx = rank === '10' ? S.font.tenScaleX : S.font.scaleX;
    width = Math.max(width, (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) * sx);
  }
  ctx.restore();
  // `art` keeps pips clear of the index column; `right` keeps fans from covering it.
  const art = S.index.cx + Math.max(width, S.index.suit * 1.05) / 2;
  if (S.indexLayout === 'row') {
    width += S.index.gap + 1 + S.index.suit * 0.85 * 1.05;
    return { width, art, right: rowIndexLeft(S) + width };
  }
  width = Math.max(width, S.index.suit * 1.05);
  return { width, art, right: S.index.cx + width / 2 };
}

function handLabel(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = rankValue(c.rank);
    total += v;
    if (v === 1) aces++;
  }
  if (cards.length === 2 && aces === 1 && total === 11) return 'BJ';
  if (aces && total + 10 <= 21) return total + 10 === 21 ? '21' : `${total}/${total + 10}`;
  return String(total);
}

function drawFelt(ctx, width, height, S, rng) {
  const g = ctx.createRadialGradient(width / 2, height * 0.42, height * 0.05, width / 2, height * 0.42, Math.max(width, height) * 0.8);
  g.addColorStop(0, S.felt[0]);
  g.addColorStop(1, S.felt[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  if (S.noise > 0) {
    const tile = makeCanvas(128, 128);
    const tctx = tile.getContext('2d');
    const img = tctx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rng() < 0.5 ? 0 : 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = Math.floor(rng() * 255 * S.noise);
    }
    tctx.putImageData(img, 0, 0);
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(0, 0, width, height);
  }
  // Soft vignette towards the corners.
  const v = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.45, width / 2, height / 2, Math.max(width, height) * 0.75);
  v.addColorStop(0, 'rgba(0, 0, 0, 0)');
  v.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, width, height);
}

function arcText(ctx, text, cx, cy, radius, font, color, spacing = 0) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const widths = [...text].map((ch) => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0);
  let angle = Math.PI / 2 + total / radius / 2;
  [...text].forEach((ch, i) => {
    const a = angle - widths[i] / radius / 2;
    ctx.save();
    ctx.translate(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
    ctx.rotate(a - Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    angle -= widths[i] / radius;
  });
  ctx.restore();
}

function drawTablePrint(ctx, S) {
  ctx.save();
  ctx.strokeStyle = S.print;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(BASE_W / 2, -420, 700, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(BASE_W / 2, -420, 752, Math.PI * 0.22, Math.PI * 0.78);
  ctx.stroke();
  ctx.restore();
  arcText(ctx, 'BLACKJACK PAYS 3 TO 2', BASE_W / 2, -420, 726, 'bold 22px Georgia, "Times New Roman", serif', S.print, 3);
  arcText(ctx, 'DEALER MUST STAND ON ALL 17s', BASE_W / 2, -420, 676, '15px Verdana, Arial, sans-serif', S.print, 2);
  arcText(ctx, 'INSURANCE PAYS 2 TO 1', BASE_W / 2, -420, 780, '13px Verdana, Arial, sans-serif', S.print, 2);
}

function drawTopBar(ctx, S, round) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, BASE_W, 34);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('PRACTICE TABLE  ·  VIRTUAL CHIPS ONLY', 18, 17);
  // Dark text on a light pill: harmless clutter the card reader must ignore.
  const label = `ROUND ${round}`;
  ctx.font = 'bold 14px Arial, sans-serif';
  const w = ctx.measureText(label).width + 22;
  ctx.fillStyle = '#f4f4f0';
  roundRect(ctx, BASE_W - 18 - w, 6, w, 22, 11);
  ctx.fill();
  ctx.fillStyle = '#1f2933';
  ctx.textAlign = 'center';
  ctx.fillText(label, BASE_W - 18 - w / 2, 18);
  ctx.restore();
}

function drawShoe(ctx, S) {
  ctx.save();
  ctx.translate(1128, 60);
  ctx.rotate(-0.12);
  for (let i = 5; i >= 0; i--) drawBack(ctx, i * 3, i * 2, S, 0.62, false);
  ctx.fillStyle = 'rgba(20, 20, 20, 0.85)';
  roundRect(ctx, -8, 52, 88, 52, 8);
  ctx.fill();
  ctx.fillStyle = S.print;
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SHOE', 36, 86);
  ctx.restore();
  // Discard tray: a squared-up stack of face-down cards.
  ctx.save();
  ctx.translate(60, 70);
  ctx.rotate(0.1);
  for (let i = 0; i < 6; i++) drawBack(ctx, 0, i * 1.5, S, 0.62, false);
  ctx.restore();
}

function drawTotalBubble(ctx, x, y, label, align) {
  ctx.save();
  ctx.font = 'bold 16px Arial, sans-serif';
  const w = ctx.measureText(label).width + 18;
  const left = align === 'right' ? x - w : x;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  roundRect(ctx, left, y - 13, w, 26, 13);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, left + w / 2, y + 1);
  ctx.restore();
}

function drawChip(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.fillStyle = '#ffffff';
  for (let k = 0; k < 6; k++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((k * Math.PI) / 3);
    ctx.fillRect(r * 0.72, -r * 0.13, r * 0.26, r * 0.26);
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#f7f7f2';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  // Plain star emblem (no values: the trainer shows no wager amounts).
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 === 0 ? r * 0.36 : r * 0.15;
    ctx.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawChipSpot(ctx, cx, cy, S, rng) {
  ctx.save();
  ctx.strokeStyle = S.print;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  const colors = ['#c62828', '#2e7d32', '#1a1a1a', '#6a1b9a'];
  const count = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    drawChip(ctx, cx - 2 + i * 2, cy + 4 - i * 5, 27, colors[Math.floor(rng() * colors.length)]);
  }
}

function drawButtons(ctx, S, hands) {
  const labels = ['HIT', 'STAND', 'DOUBLE'];
  const first = hands[0] || [];
  if (hands.length === 1 && first.length === 2 && rankValue(first[0].rank) === rankValue(first[1].rank)) labels.push('SPLIT');
  const palette = {
    dark: [['#1e6b35', '#ffffff'], ['#8f1d1d', '#ffffff'], ['#9a6b00', '#ffffff'], ['#1d4f8f', '#ffffff']],
    light: [['#ffffff', '#1f2937'], ['#ffffff', '#b91c1c'], ['#ffffff', '#1f2937'], ['#ffffff', '#1d4ed8']],
    neon: [['#0e7490', '#e0f7ff'], ['#9d174d', '#ffe4ef'], ['#6d28d9', '#efe7ff'], ['#15803d', '#e5ffe9']],
  }[S.buttons];
  ctx.save();
  ctx.font = 'bold 17px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let x = BASE_W - 24 - labels.length * 112;
  labels.forEach((label, i) => {
    const [bg, fg] = palette[i % palette.length];
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = bg;
    roundRect(ctx, x, 654, 100, 42, 21);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = fg;
    ctx.fillText(label, x + 50, 676);
    x += 112;
  });
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  roundRect(ctx, 20, 648, 210, 52, 10);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.fillText('BALANCE (VIRTUAL)', 34, 664);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.fillText('1,000', 34, 685);
  ctx.restore();
}

function drawBack(ctx, x, y, S, k = 1, shadow = true) {
  const w = S.card.w * k;
  const h = S.card.h * k;
  const b = S.back;
  ctx.save();
  if (shadow) {
    ctx.shadowColor = S.card.shadow;
    ctx.shadowBlur = S.card.blur;
    ctx.shadowOffsetX = S.card.sx;
    ctx.shadowOffsetY = S.card.sy;
  }
  ctx.fillStyle = b.border;
  roundRect(ctx, x, y, w, h, S.card.r * k);
  ctx.fill();
  ctx.restore();
  if (S.card.edge) {
    ctx.save();
    ctx.strokeStyle = S.card.edge;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, S.card.r * k);
    ctx.stroke();
    ctx.restore();
  }
  const m = 5 * k;
  ctx.save();
  roundRect(ctx, x + m, y + m, w - 2 * m, h - 2 * m, S.card.r * k * 0.6);
  ctx.fillStyle = b.base;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = b.line;
  ctx.fillStyle = b.line;
  ctx.lineWidth = 1.2 * k;
  const step = 8 * k;
  if (b.pattern === 'lattice' || b.pattern === 'stripes') {
    const lw = b.pattern === 'stripes' ? 3.5 * k : 1.2 * k;
    ctx.lineWidth = lw;
    for (let t = -h; t < w + h; t += b.pattern === 'stripes' ? step * 1.4 : step) {
      ctx.beginPath();
      ctx.moveTo(x + t, y);
      ctx.lineTo(x + t + h, y + h);
      ctx.stroke();
      if (b.pattern === 'lattice') {
        ctx.beginPath();
        ctx.moveTo(x + t + h, y);
        ctx.lineTo(x + t, y + h);
        ctx.stroke();
      }
    }
  } else {
    for (let yy = y + m + step / 2; yy < y + h; yy += step) {
      for (let xx = x + m + step / 2; xx < x + w; xx += step) {
        ctx.beginPath();
        if (b.pattern === 'dots') {
          ctx.arc(xx, yy, 1.8 * k, 0, Math.PI * 2);
        } else {
          ctx.moveTo(xx, yy - 3 * k);
          ctx.lineTo(xx + 2.4 * k, yy);
          ctx.lineTo(xx, yy + 3 * k);
          ctx.lineTo(xx - 2.4 * k, yy);
          ctx.closePath();
        }
        ctx.fill();
      }
    }
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = b.line;
  ctx.lineWidth = 1.5 * k;
  roundRect(ctx, x + m + 3 * k, y + m + 3 * k, w - 2 * m - 6 * k, h - 2 * m - 6 * k, S.card.r * k * 0.4);
  ctx.stroke();
  ctx.fillStyle = b.base;
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, w * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Corner index. S.indexLayout: 'stack' (suit below the rank, the default),
// 'row' (suit right of the rank) or 'rank' (no suit in the corner).
function drawIndex(ctx, card, x, y, S, color) {
  const f = S.font;
  const layout = S.indexLayout || 'stack';
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = fontOf(S);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(card.rank);
  const sx = card.rank === '10' ? f.tenScaleX : f.scaleX;
  const cx = layout === 'row' ? x + rowIndexLeft(S) + m.actualBoundingBoxLeft * sx : x + S.index.cx;
  const top = y + S.index.top;
  const baseline = top + m.actualBoundingBoxAscent;
  ctx.save();
  ctx.translate(cx, baseline);
  ctx.scale(sx, 1);
  ctx.fillText(card.rank, 0, 0);
  ctx.restore();
  const rx0 = cx - m.actualBoundingBoxLeft * sx;
  const rx1 = cx + m.actualBoundingBoxRight * sx;
  const bottom = baseline + m.actualBoundingBoxDescent;
  let box = { x0: rx0, y0: top, x1: rx1, y1: bottom };
  if (layout !== 'rank') {
    const sh = layout === 'row' ? S.index.suit * 0.85 : S.index.suit;
    const sw = sh * SUIT_ASPECT[card.suit];
    const sxLeft = layout === 'row' ? rx1 + S.index.gap + 1 : cx - sw / 2;
    const sy = layout === 'row' ? top + (bottom - top - sh) / 2 : bottom + S.index.gap;
    drawSuit(ctx, card.suit, sxLeft, sy, sw, sh, S.suitVariant);
    box = { x0: Math.min(rx0, sxLeft), y0: top, x1: Math.max(rx1, sxLeft + sw), y1: Math.max(bottom, sy + sh) };
  }
  ctx.restore();
  return { x: box.x0, y: box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0 };
}

function drawCardFace(ctx, card, x, y, S, metrics) {
  const { w, h, r } = S.card;
  const color = isRed(card.suit) ? S.red : S.black;
  ctx.save();
  ctx.shadowColor = S.card.shadow;
  ctx.shadowBlur = S.card.blur;
  ctx.shadowOffsetX = S.card.sx;
  ctx.shadowOffsetY = S.card.sy;
  if (S.card.face2) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, S.card.face);
    g.addColorStop(1, S.card.face2);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = S.card.face;
  }
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
  if (S.card.edge) {
    ctx.save();
    ctx.strokeStyle = S.card.edge;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  // Keep the artwork clear of the corner indices on both sides.
  const margin = Math.max(w * 0.27, metrics.art + 4);
  // Large-print designs (and non-stacked indices) use one big suit as the art.
  const simple = S.cornerIndexOnly || (S.indexLayout && S.indexLayout !== 'stack');
  if (simple) {
    drawCornerSuit(ctx, card, x, y, S);
  } else if (['J', 'Q', 'K'].includes(card.rank)) {
    if (S.court === 'figure') drawCourtFigure(ctx, card, x, y, S, color, margin);
    else drawCourtLetter(ctx, card, x, y, S, color, margin);
  } else if (card.rank === 'A') {
    drawBigSuit(ctx, card, x, y, S, margin);
  } else {
    drawPips(ctx, card, x, y, S, margin);
  }
  ctx.restore();
  const indexBox = drawIndex(ctx, card, x, y, S, color);
  if (!simple) {
    ctx.save();
    ctx.translate(2 * x + w, 2 * y + h);
    ctx.rotate(Math.PI);
    drawIndex(ctx, card, x, y, S, color);
    ctx.restore();
  }
  return indexBox;
}

// Large-print mobile decks: one big suit in the lower right, no rotated index.
function drawCornerSuit(ctx, card, x, y, S) {
  const { w, h } = S.card;
  const size = h * 0.36;
  const sw = size * SUIT_ASPECT[card.suit];
  drawSuit(ctx, card.suit, x + w - sw - w * 0.1, y + h - size - h * 0.09, sw, size, S.suitVariant);
}

function drawBigSuit(ctx, card, x, y, S, margin) {
  const { w, h } = S.card;
  const size = Math.min(h * 0.34, (w - 2 * margin) / SUIT_ASPECT[card.suit]);
  const sw = size * SUIT_ASPECT[card.suit];
  drawSuit(ctx, card.suit, x + (w - sw) / 2, y + (h - size) / 2, sw, size, S.suitVariant);
}

function drawPips(ctx, card, x, y, S, margin) {
  const { w, h } = S.card;
  const n = Number(card.rank);
  const aspect = SUIT_ASPECT[card.suit];
  // 9 and 10 have a centre column next to the side columns, so their pips are smaller.
  const avail = w - 2 * margin;
  const pipW = Math.min(h * (n >= 9 ? 0.11 : 0.15) * aspect, avail / (n >= 9 ? 3 : 2.2));
  const pipH = pipW / aspect;
  const colL = x + margin + pipW / 2;
  const colR = x + w - margin - pipW / 2;
  const rowT = y + h * 0.21;
  const rowB = y + h * 0.79;
  for (const [cu, rv] of PIP_LAYOUTS[n]) {
    const px = colL + cu * (colR - colL);
    const py = rowT + rv * (rowB - rowT);
    ctx.save();
    ctx.translate(px, py);
    if (rv > 0.5) ctx.rotate(Math.PI);
    drawSuit(ctx, card.suit, -pipW / 2, -pipH / 2, pipW, pipH, S.suitVariant);
    ctx.restore();
  }
}

function courtFrame(x, y, S, margin) {
  const { w, h } = S.card;
  return { fx: x + margin, fy: y + h * 0.1, fw: w - 2 * margin, fh: h * 0.8 };
}

function drawCourtFigure(ctx, card, x, y, S, color, margin) {
  const { h } = S.card;
  const { fx, fy, fw, fh } = courtFrame(x, y, S, margin);
  ctx.save();
  ctx.fillStyle = '#fbf0d9';
  ctx.fillRect(fx, fy, fw, fh);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = color;
  ctx.strokeRect(fx, fy, fw, fh);
  ctx.restore();
  const cx = fx + fw / 2;
  const half = () => {
    // Robe, collar, head and headwear; the lower half is the same figure rotated.
    ctx.fillStyle = '#2b4c9b';
    ctx.beginPath();
    ctx.moveTo(cx - fw * 0.46, y + h * 0.5);
    ctx.lineTo(cx - fw * 0.32, y + h * 0.38);
    ctx.lineTo(cx + fw * 0.32, y + h * 0.38);
    ctx.lineTo(cx + fw * 0.46, y + h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(cx - fw * 0.12, y + h * 0.38, fw * 0.24, h * 0.12);
    ctx.fillStyle = '#e3b341';
    ctx.fillRect(cx - fw * 0.32, y + h * 0.38, fw * 0.64, h * 0.018);
    ctx.fillStyle = '#f3cfa6';
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.3, fw * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = card.rank === 'J' ? color : '#e3b341';
    ctx.beginPath();
    const top = y + h * 0.3 - fw * 0.15;
    if (card.rank === 'J') {
      ctx.ellipse(cx, top + 1, fw * 0.18, fw * 0.08, 0, Math.PI, 0);
    } else {
      const spikes = card.rank === 'K' ? 3 : 2;
      ctx.moveTo(cx - fw * 0.16, top + 2);
      for (let i = 0; i <= spikes * 2; i++) {
        const u = -0.16 + (0.32 * i) / (spikes * 2);
        ctx.lineTo(cx + fw * u, top + (i % 2 === 0 ? -fw * 0.14 : -fw * 0.03));
      }
      ctx.lineTo(cx + fw * 0.16, top + 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    const sh = h * 0.07;
    drawSuit(ctx, card.suit, fx + 3, fy + 4, sh * SUIT_ASPECT[card.suit], sh, S.suitVariant);
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(fx, fy, fw, fh);
  ctx.clip();
  half();
  ctx.translate(2 * cx, 2 * (y + h / 2));
  ctx.rotate(Math.PI);
  half();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fx, y + h * 0.52);
  ctx.lineTo(fx + fw, y + h * 0.48);
  ctx.stroke();
  ctx.restore();
}

// Minimal decks: a large rank and suit printed in a thin frame.
function drawCourtLetter(ctx, card, x, y, S, color, margin) {
  const { h } = S.card;
  const { fx, fy, fw, fh } = courtFrame(x, y, S, margin);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = color;
  ctx.strokeRect(fx, fy, fw, fh);
  ctx.restore();
  const cx = fx + fw / 2;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = fontOf(S, S.font.size * 1.9);
  const m = ctx.measureText(card.rank);
  const k = Math.min(S.font.scaleX, (fw - 6) / (m.actualBoundingBoxLeft + m.actualBoundingBoxRight));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const top = y + h * 0.25;
  ctx.translate(cx, top + m.actualBoundingBoxAscent);
  ctx.scale(k, 1);
  ctx.fillText(card.rank, 0, 0);
  ctx.restore();
  const sh = S.index.suit * 1.6;
  const sw = sh * SUIT_ASPECT[card.suit];
  ctx.fillStyle = color;
  drawSuit(ctx, card.suit, cx - sw / 2, top + m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + 6, sw, sh, S.suitVariant);
}
