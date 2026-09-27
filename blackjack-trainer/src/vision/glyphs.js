// Glyph templates for card corner indices, rendered at runtime from local fonts,
// plus the feature extraction shared by templates and detected glyphs.

import { drawSuit, SUIT_ASPECT, SUIT_VARIANTS } from './suits.js';

export const GRID_W = 16;
export const GRID_H = 24;
const DIM = GRID_W * GRID_H;

export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUIT_LABELS = ['S', 'H', 'D', 'C'];
// Look-alikes that must never be reported as ranks on their own.
const OTHER_LABELS = ['1', '0'];

const KIND_RANK = 0;
const KIND_SUIT = 1;
const KIND_SUIT180 = 2;
const KIND_OTHER = 3;

const TEMPLATE_FONTS = [
  'serif', 'sans-serif', 'monospace', 'system-ui',
  'Georgia', '"Times New Roman"', 'Arial', 'Helvetica', 'Verdana', '"Trebuchet MS"', '"Courier New"',
  'Tahoma', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', '"Palatino Linotype"', 'Impact', '"Arial Narrow"',
];
const WEIGHTS = ['normal', 'bold'];
const SQUEEZE = [1, 0.72];
const FONT_PX = 48;
const SUIT_CHARS = { S: '♠', H: '♥', D: '♦', C: '♣' };

let cached = null;

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Sub-pixel bounding box of the ink in `plane` (values 0..1, width pw) inside
 * the integer window [wx0, wx1) x [wy0, wy1). Partially covered edge rows and
 * columns count fractionally, so small anti-aliased glyphs line up with the
 * large crisp templates.
 */
export function inkBounds(plane, pw, wx0, wy0, wx1, wy1, minLevel = 0.1) {
  let top = -1;
  let bottom = -1;
  let left = -1;
  let right = -1;
  const rowMax = new Float32Array(wy1 - wy0);
  const colMax = new Float32Array(wx1 - wx0);
  for (let y = wy0; y < wy1; y++) {
    const row = y * pw;
    for (let x = wx0; x < wx1; x++) {
      const v = plane[row + x];
      if (v > rowMax[y - wy0]) rowMax[y - wy0] = v;
      if (v > colMax[x - wx0]) colMax[x - wx0] = v;
    }
  }
  for (let i = 0; i < rowMax.length; i++) if (rowMax[i] >= minLevel) { top = i; break; }
  for (let i = rowMax.length - 1; i >= 0; i--) if (rowMax[i] >= minLevel) { bottom = i; break; }
  for (let i = 0; i < colMax.length; i++) if (colMax[i] >= minLevel) { left = i; break; }
  for (let i = colMax.length - 1; i >= 0; i--) if (colMax[i] >= minLevel) { right = i; break; }
  if (top < 0 || left < 0) return null;
  const frac = (v) => Math.min(1, v);
  return {
    x0: wx0 + left + 1 - frac(colMax[left]),
    y0: wy0 + top + 1 - frac(rowMax[top]),
    x1: wx0 + right + frac(colMax[right]),
    y1: wy0 + bottom + frac(rowMax[bottom]),
  };
}

function sampleBilinear(plane, pw, ph, x, y) {
  const u = x - 0.5;
  const v = y - 0.5;
  const ix = Math.floor(u);
  const iy = Math.floor(v);
  const fx = u - ix;
  const fy = v - iy;
  let acc = 0;
  if (iy >= 0 && iy < ph) {
    const r = iy * pw;
    if (ix >= 0 && ix < pw) acc += plane[r + ix] * (1 - fx) * (1 - fy);
    if (ix + 1 >= 0 && ix + 1 < pw) acc += plane[r + ix + 1] * fx * (1 - fy);
  }
  if (iy + 1 >= 0 && iy + 1 < ph) {
    const r = (iy + 1) * pw;
    if (ix >= 0 && ix < pw) acc += plane[r + ix] * (1 - fx) * fy;
    if (ix + 1 >= 0 && ix + 1 < pw) acc += plane[r + ix + 1] * fx * fy;
  }
  return acc;
}

/**
 * Resample the box (x0, y0, x1, y1) of `plane` into the GRID_W x GRID_H grid,
 * blur it slightly and normalise to zero mean / unit length.
 */
export function gridFeatures(plane, pw, ph, box) {
  const grid = new Float32Array(DIM);
  const cw = (box.x1 - box.x0) / GRID_W;
  const ch = (box.y1 - box.y0) / GRID_H;
  const nx = Math.min(5, Math.max(2, Math.ceil(cw * 1.5)));
  const ny = Math.min(5, Math.max(2, Math.ceil(ch * 1.5)));
  const inv = 1 / (nx * ny);
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      let acc = 0;
      for (let sy = 0; sy < ny; sy++) {
        const y = box.y0 + (gy + (sy + 0.5) / ny) * ch;
        for (let sx = 0; sx < nx; sx++) {
          acc += sampleBilinear(plane, pw, ph, box.x0 + (gx + (sx + 0.5) / nx) * cw, y);
        }
      }
      grid[gy * GRID_W + gx] = acc * inv;
    }
  }
  return normalize(blur(grid));
}

function blur(grid) {
  const tmp = new Float32Array(DIM);
  const out = new Float32Array(DIM);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x;
      const l = x > 0 ? grid[i - 1] : 0;
      const r = x < GRID_W - 1 ? grid[i + 1] : 0;
      tmp[i] = (l + 2 * grid[i] + r) * 0.25;
    }
  }
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x;
      const u = y > 0 ? tmp[i - GRID_W] : 0;
      const d = y < GRID_H - 1 ? tmp[i + GRID_W] : 0;
      out[i] = (u + 2 * tmp[i] + d) * 0.25;
    }
  }
  return out;
}

function normalize(v) {
  let mean = 0;
  for (let i = 0; i < v.length; i++) mean += v[i];
  mean /= v.length;
  let norm = 0;
  for (let i = 0; i < v.length; i++) {
    v[i] -= mean;
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Render with `draw(ctx)` in black on white and return the normalised glyph.
function captureGlyph(ctx, canvas, draw) {
  const { width, height } = canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';
  draw(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);
  const plane = new Float32Array(width * height);
  let colored = false;
  for (let i = 0, p = 0; p < plane.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 60) colored = true;
    plane[p] = (255 - (r * 77 + g * 150 + b * 29) / 256) / 255;
  }
  if (colored) return null; // emoji-style rendering, not a usable template
  const box = inkBounds(plane, width, 0, 0, width, height, 0.25);
  if (!box || box.y1 - box.y0 < 8) return null;
  return { vec: gridFeatures(plane, width, height, box), aspect: (box.x1 - box.x0) / (box.y1 - box.y0) };
}

function textDrawer(font, text, squeeze, tracking = 1) {
  return (ctx) => {
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    ctx.setTransform(squeeze, 0, 0, 1, 12, 0);
    if (tracking === 1 || text.length < 2) {
      ctx.fillText(text, 0, 88);
    } else {
      let x = 0;
      for (const ch of text) {
        ctx.fillText(ch, x, 88);
        x += ctx.measureText(ch).width * tracking;
      }
    }
  };
}

function buildTemplates() {
  const canvas = makeCanvas(200, 128);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const list = [];
  const add = (glyph, label, kind) => {
    if (!glyph) return;
    // Skip near-duplicates of an existing template with the same label.
    for (const t of list) if (t.label === label && Math.abs(t.aspect - glyph.aspect) < 0.03 && dot(t.vec, glyph.vec) > 0.985) return;
    list.push({ label, kind, vec: glyph.vec, aspect: glyph.aspect });
  };

  const signatures = [];
  for (const family of TEMPLATE_FONTS) {
    for (const weight of WEIGHTS) {
      const font = `${weight} ${FONT_PX}px ${family}`;
      // Families missing on this system fall back to a font we already have.
      const sig = ['Q', '8', 'K', '4', 'A'].map((t) => captureGlyph(ctx, canvas, textDrawer(font, t, 1)));
      if (sig.some((g) => !g)) continue;
      const duplicate = signatures.some((s) => s.every((g, i) => Math.abs(g.aspect - sig[i].aspect) < 0.01 && dot(g.vec, sig[i].vec) > 0.998));
      if (duplicate) continue;
      signatures.push(sig);
      for (const squeeze of SQUEEZE) {
        for (const label of RANK_LABELS) {
          if (label === '10') {
            add(captureGlyph(ctx, canvas, textDrawer(font, '10', squeeze)), '10', KIND_RANK);
            add(captureGlyph(ctx, canvas, textDrawer(font, '10', squeeze, 0.82)), '10', KIND_RANK);
          } else {
            add(captureGlyph(ctx, canvas, textDrawer(font, label, squeeze)), label, KIND_RANK);
          }
        }
        for (const label of OTHER_LABELS) add(captureGlyph(ctx, canvas, textDrawer(font, label, squeeze)), label, KIND_OTHER);
      }
    }
  }

  for (const suit of SUIT_LABELS) {
    for (const variant of SUIT_VARIANTS) {
      for (const stretch of [0.85, 1, 1.18]) {
        const h = 80;
        const w = h * SUIT_ASPECT[suit] * stretch;
        add(captureGlyph(ctx, canvas, (c) => drawSuit(c, suit, 20, 20, w, h, variant)), suit, KIND_SUIT);
        if (suit !== 'D') {
          add(captureGlyph(ctx, canvas, (c) => {
            c.setTransform(-1, 0, 0, -1, 40 + w, 120);
            drawSuit(c, suit, 0, 0, w, h, variant);
          }), `${suit}180`, KIND_SUIT180);
        }
      }
    }
    for (const family of ['serif', 'sans-serif', 'monospace', 'system-ui']) {
      add(captureGlyph(ctx, canvas, textDrawer(`${FONT_PX * 1.5}px ${family}`, SUIT_CHARS[suit], 1)), suit, KIND_SUIT);
    }
  }

  const matrix = new Float32Array(list.length * DIM);
  list.forEach((t, i) => matrix.set(t.vec, i * DIM));
  const labels = [...RANK_LABELS, ...SUIT_LABELS, ...SUIT_LABELS.map((s) => `${s}180`), ...OTHER_LABELS];
  const labelIndex = new Map(labels.map((l, i) => [l, i]));
  const kinds = labels.map((l) => (RANK_LABELS.includes(l) ? KIND_RANK : SUIT_LABELS.includes(l) ? KIND_SUIT : l.endsWith('180') ? KIND_SUIT180 : KIND_OTHER));
  const tLabel = new Int32Array(list.length);
  const tLogAspect = new Float32Array(list.length);
  list.forEach((t, i) => {
    tLabel[i] = labelIndex.get(t.label);
    tLogAspect[i] = Math.log(t.aspect + 0.08);
  });
  return { count: list.length, matrix, tLabel, tLogAspect, labels, kinds };
}

/** Build (once) and return the template set. Needs a 2D canvas. */
export function getTemplates() {
  if (!cached) cached = buildTemplates();
  return cached;
}

/**
 * Score a glyph against every template. Returns the best score per label
 * (after an aspect-ratio penalty) plus convenience summaries.
 */
export function classifyGlyph(vec, aspect) {
  const T = getTemplates();
  const best = new Float32Array(T.labels.length).fill(-1);
  // The +0.08 keeps stroke width from dominating the ratio of very narrow glyphs.
  const logA = Math.log(aspect + 0.08);
  const { matrix, tLabel, tLogAspect } = T;
  for (let t = 0; t < T.count; t++) {
    const off = t * DIM;
    let s = 0;
    for (let d = 0; d < DIM; d++) s += matrix[off + d] * vec[d];
    const da = Math.abs(logA - tLogAspect[t]) - 0.12;
    if (da > 0) s -= 0.6 * da;
    const l = tLabel[t];
    if (s > best[l]) best[l] = s;
  }
  const summary = (kind) => {
    let first = null;
    let second = -1;
    for (let l = 0; l < T.labels.length; l++) {
      if (T.kinds[l] !== kind) continue;
      if (!first || best[l] > first.score) {
        if (first) second = Math.max(second, first.score);
        first = { label: T.labels[l], score: best[l] };
      } else if (best[l] > second) {
        second = best[l];
      }
    }
    return { label: first.label, score: first.score, second };
  };
  const rank = summary(KIND_RANK);
  const suit = summary(KIND_SUIT);
  const suit180 = summary(KIND_SUIT180);
  const other = summary(KIND_OTHER);
  const scores = {};
  T.labels.forEach((l, i) => { scores[l] = best[i]; });
  const ranking = RANK_LABELS.map((label) => ({ label, score: scores[label] })).sort((a, b) => b.score - a.score);
  return { rank, suit, suit180, other, ranking, scores };
}
