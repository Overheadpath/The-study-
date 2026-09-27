// Screenshot card reader. Finds card corner indices (a rank glyph with a small
// suit symbol below it) on light card faces, classifies them against glyph
// templates rendered at runtime, and groups the cards into dealer / player hands.
// Pure client-side, no dependencies; results are suggestions the learner confirms.

import { classifyGlyph, getTemplates, gridFeatures, inkBounds, makeCanvas } from './glyphs.js';

const DEFAULT_MAX_PIXELS = 4_200_000;
const FACE_MAX_CHROMA = 64;
const INK_WEAK = 40; // luma drop below the paper that may belong to a glyph
const INK_STRONG = 90; // luma drop that is certainly ink
const MIN_REGION_H = 24;
const MIN_PROBABILITY = 0.3;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Read the cards in a screenshot.
 * source: File | Blob | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap | ImageData
 */
export async function readCardsFromImage(source, options = {}) {
  const t0 = now();
  if (isImageDataLike(source)) return detectCards(source, options);
  const { image, width, height, release } = await toDrawable(source);
  try {
    if (!width || !height) throw new Error('The image is empty or could not be decoded.');
    const maxPixels = options.maxPixels || DEFAULT_MAX_PIXELS;
    const k = width * height > maxPixels ? Math.sqrt(maxPixels / (width * height)) : 1;
    const w = Math.max(1, Math.round(width * k));
    const h = Math.max(1, Math.round(height * k));
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, w, h);
    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, w, h);
    } catch (err) {
      throw new Error('The image could not be read (it may come from another website). Save it and upload the file instead.');
    }
    const result = detectCards(imageData, { ...options, originalWidth: width, originalHeight: height });
    result.timingMs = Math.round(now() - t0);
    return result;
  } finally {
    release();
  }
}

function isImageDataLike(src) {
  return src && typeof src === 'object' && src.data && typeof src.width === 'number' && typeof src.height === 'number' && src.data.length === src.width * src.height * 4;
}

async function toDrawable(source) {
  const none = () => {};
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(source);
        return { image: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close && bmp.close() };
      } catch {
        // Fall through to <img> decoding (older Safari, unusual formats).
      }
    }
    const url = URL.createObjectURL(source);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw new Error('That file does not look like an image we can read. Try a PNG or JPEG screenshot.');
    }
  }
  if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
    if (!source.complete || !source.naturalWidth) await source.decode();
    return { image: source, width: source.naturalWidth, height: source.naturalHeight, release: none };
  }
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    return { image: source, width: source.width, height: source.height, release: none };
  }
  if (source && typeof source.getContext === 'function') {
    return { image: source, width: source.width, height: source.height, release: none };
  }
  throw new TypeError('readCardsFromImage expects a File, Blob, image, canvas or ImageBitmap.');
}

/**
 * Synchronous core. imageData: { data: RGBA bytes, width, height }.
 * options.originalWidth / originalHeight: size of the source image when
 * imageData is a scaled copy (boxes are reported in original pixels).
 */
export function detectCards(imageData, options = {}) {
  const t0 = now();
  const srcW = imageData.width;
  const srcH = imageData.height;
  const origW = options.originalWidth || srcW;
  const origH = options.originalHeight || srcH;
  getTemplates();

  let img = imageData;
  let factor = 1;
  const maxPixels = options.maxPixels || DEFAULT_MAX_PIXELS;
  if (srcW * srcH > maxPixels) {
    factor = Math.ceil(Math.sqrt((srcW * srcH) / maxPixels));
    img = downsample(imageData, factor);
  }
  const W = img.width;
  const H = img.height;
  const N = W * H;
  const toOrigX = (origW / srcW) * factor;
  const toOrigY = (origH / srcH) * factor;

  const { luma, chroma } = channels(img.data, N);
  const tFace = faceThreshold(luma, chroma, N);
  const face = new Uint8Array(N);
  for (let p = 0; p < N; p++) face[p] = luma[p] >= tFace && chroma[p] <= FACE_MAX_CHROMA ? 1 : 0;
  const { labels, regions } = labelRegions(face, W, H);

  const env = { W, H, luma, labels, data: img.data, stack: new Int32Array(N) };
  const contexts = [];
  const debug = options.debug ? { regions: [], skipped: [], candidates: [], pairs: [] } : null;
  for (const region of regions) {
    if (!region) continue;
    const rh = region.y1 - region.y0 + 1;
    const rw = region.x1 - region.x0 + 1;
    if (rh < MIN_REGION_H || rw < 16 || region.area < 300 || region.area > N * 0.6 || region.area < 0.1 * rw * rh) {
      if (debug && rh >= MIN_REGION_H) debug.skipped.push({ ...region, fill: region.area / (rw * rh) });
      continue;
    }
    const rc = analyzeRegion(region, env, debug);
    if (rc) contexts.push(rc);
  }

  // Most decks print the suit under the rank; some print it beside the rank,
  // a few not at all. Use whichever reading the evidence supports best.
  const stack = contexts.flatMap((rc) => readIndices(rc, 'stack', debug));
  const row = contexts.flatMap((rc) => readIndices(rc, 'row', null));
  const bare = contexts.flatMap((rc) => readBareRanks(rc));
  const weight = (cards) => cards.reduce((sum, c) => sum + c.confidence, 0);
  let found = weight(row) > weight(stack) ? row : stack;
  let layout = found === row && row.length ? 'row' : 'stack';
  // Rank-only readings are capped at 0.6 confidence, so they only win when
  // the paired readings found clearly fewer cards.
  if (weight(bare) > 1.5 * weight(found)) {
    found = bare;
    layout = 'rank';
  }
  found = suppressOutliers(found);
  const result = assemble(found, { toOrigX, toOrigY, origW, origH, W, H });
  if (found.length && layout === 'rank') {
    result.notes.unshift('No suit symbols were found next to the card ranks, so the cards were read from their rank only. Please check them.');
  }
  result.timingMs = Math.round(now() - t0);
  if (debug) result.debug = { ...debug, scaleX: toOrigX, scaleY: toOrigY };
  return result;
}

function downsample(src, f) {
  const w = Math.floor(src.width / f);
  const h = Math.floor(src.height / f);
  const out = new Uint8ClampedArray(w * h * 4);
  const sw = src.width;
  const d = src.data;
  const inv = 1 / (f * f);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < f; dy++) {
        let i = ((y * f + dy) * sw + x * f) * 4;
        for (let dx = 0; dx < f; dx++, i += 4) {
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r * inv;
      out[o + 1] = g * inv;
      out[o + 2] = b * inv;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

function channels(data, N) {
  const luma = new Uint8Array(N);
  const chroma = new Uint8Array(N);
  for (let p = 0, i = 0; p < N; p++, i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    luma[p] = (r * 77 + g * 150 + b * 29) >> 8;
    const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
    const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
    chroma[p] = mx - mn;
  }
  return { luma, chroma };
}

// Card faces are the brightest low-saturation surfaces; threshold relative to them.
function faceThreshold(luma, chroma, N) {
  const hist = new Uint32Array(256);
  for (let p = 0; p < N; p++) if (chroma[p] <= FACE_MAX_CHROMA) hist[luma[p]]++;
  const need = Math.max(64, N * 0.002);
  let acc = 0;
  let top = 255;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= need) {
      top = v;
      break;
    }
  }
  return Math.max(135, Math.min(205, top - 60));
}

function labelRegions(mask, W, H) {
  const N = W * H;
  const labels = new Int32Array(N);
  const stack = new Int32Array(N);
  const regions = [null];
  let next = 1;
  for (let start = 0; start < N; start++) {
    if (!mask[start] || labels[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = next;
    let area = 0;
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    while (sp) {
      const p = stack[--sp];
      area++;
      const y = (p / W) | 0;
      const x = p - y * W;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = next; stack[sp++] = p - 1; }
      if (x < W - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = next; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - W] && !labels[p - W]) { labels[p - W] = next; stack[sp++] = p - W; }
      if (y < H - 1 && mask[p + W] && !labels[p + W]) { labels[p + W] = next; stack[sp++] = p + W; }
    }
    regions.push({ id: next, area, x0, y0, x1, y1 });
    next++;
  }
  return { labels, regions };
}

function percentile(hist, total, q) {
  const target = total * q;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) return v;
  }
  return 255;
}

// Everything inside one light region: its holes are the printed ink.
function analyzeRegion(region, env, debug) {
  const { W, luma, labels, data, stack } = env;
  const { id, x0, y0 } = region;
  const bw = region.x1 - x0 + 1;
  const bh = region.y1 - y0 + 1;
  const M = bw * bh;
  // state: 1 = face pixel of this region, 2 = outside, 0 = hole (inside the region)
  const state = new Uint8Array(M);
  const hist = new Uint32Array(256);
  for (let y = 0; y < bh; y++) {
    let p = (y0 + y) * W + x0;
    let q = y * bw;
    for (let x = 0; x < bw; x++, p++, q++) {
      if (labels[p] === id) {
        state[q] = 1;
        hist[luma[p]]++;
      }
    }
  }
  const paper = percentile(hist, region.area, 0.5);
  let sp = 0;
  const seed = (q) => {
    if (state[q] === 0) {
      state[q] = 2;
      stack[sp++] = q;
    }
  };
  for (let x = 0; x < bw; x++) {
    seed(x);
    seed((bh - 1) * bw + x);
  }
  for (let y = 0; y < bh; y++) {
    seed(y * bw);
    seed(y * bw + bw - 1);
  }
  while (sp) {
    const q = stack[--sp];
    const y = (q / bw) | 0;
    const x = q - y * bw;
    if (x > 0 && state[q - 1] === 0) { state[q - 1] = 2; stack[sp++] = q - 1; }
    if (x < bw - 1 && state[q + 1] === 0) { state[q + 1] = 2; stack[sp++] = q + 1; }
    if (y > 0 && state[q - bw] === 0) { state[q - bw] = 2; stack[sp++] = q - bw; }
    if (y < bh - 1 && state[q + bw] === 0) { state[q + bw] = 2; stack[sp++] = q + bw; }
  }

  const weakLimit = paper - INK_WEAK;
  const strongLimit = paper - INK_STRONG;
  reclaimTouchingInk(state, bw, bh, (q) => {
    const y = (q / bw) | 0;
    return luma[(y0 + y) * W + x0 + q - y * bw] <= weakLimit;
  }, Math.max(4, Math.round(bh * 0.12)));

  // Ink components inside the holes (8-connected, hysteresis thresholds).
  const inkLab = new Int32Array(M);
  const comps = [null];
  for (let start = 0; start < M; start++) {
    if (state[start] !== 0 || inkLab[start]) continue;
    const sy = (start / bw) | 0;
    const sx = start - sy * bw;
    if (luma[(y0 + sy) * W + x0 + sx] > weakLimit) continue;
    const cid = comps.length;
    inkLab[start] = cid;
    sp = 0;
    stack[sp++] = start;
    const c = { id: cid, n: 0, strong: 0, r: 0, g: 0, b: 0, x0: bw, y0: bh, x1: -1, y1: -1 };
    while (sp) {
      const q = stack[--sp];
      const y = (q / bw) | 0;
      const x = q - y * bw;
      const p = (y0 + y) * W + x0 + x;
      c.n++;
      if (luma[p] <= strongLimit) {
        c.strong++;
        c.r += data[p * 4];
        c.g += data[p * 4 + 1];
        c.b += data[p * 4 + 2];
      }
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= bh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= bw || (dx === 0 && dy === 0)) continue;
          const qq = yy * bw + xx;
          if (state[qq] !== 0 || inkLab[qq]) continue;
          if (luma[(y0 + yy) * W + x0 + xx] > weakLimit) continue;
          inkLab[qq] = cid;
          stack[sp++] = qq;
        }
      }
    }
    comps.push(c);
  }

  // Glyph-sized components with a solid core.
  const glyphs = [];
  const maxH = Math.max(10, bh * 0.45);
  for (let i = 1; i < comps.length; i++) {
    const c = comps[i];
    const h = c.y1 - c.y0 + 1;
    const w = c.x1 - c.x0 + 1;
    if (c.strong < 3 || c.n < 6 || h < 5 || h > maxH || w > 2.6 * h + 2) continue;
    const mr = c.r / c.strong;
    const mg = c.g / c.strong;
    const mb = c.b / c.strong;
    c.redness = mr - Math.max(mg, mb);
    c.color = c.redness > 28 ? 'red' : 'black';
    c.h = h;
    c.w = w;
    glyphs.push(c);
  }
  if (!glyphs.length) return null;

  // Ink reference per colour: the darkest solid pixels (suit symbols are solid).
  const inkRef = { red: 255, black: 255 };
  for (const color of ['red', 'black']) {
    const ids = new Set(glyphs.filter((g) => g.color === color).map((g) => g.id));
    if (!ids.size) continue;
    const h2 = new Uint32Array(256);
    let total = 0;
    for (let q = 0; q < M; q++) {
      if (!ids.has(inkLab[q])) continue;
      const y = (q / bw) | 0;
      const v = luma[(y0 + y) * W + x0 + q - y * bw];
      if (v <= strongLimit) {
        h2[v]++;
        total++;
      }
    }
    inkRef[color] = total ? percentile(h2, total, 0.1) : strongLimit;
  }

  const ctxLocal = { W, x0, y0, bw, bh, luma, inkLab, state, paper, inkRef };
  // Parts: whole components, plus the halves of a rank and suit that touch.
  const parts = [];
  for (const g of glyphs) {
    parts.push(makePart(g, g.y0, g.y1, inkLab, bw));
    const split = findSplitRow(g, ctxLocal);
    if (split > 0) {
      parts.push(makePart(g, g.y0, split - 1, inkLab, bw));
      parts.push(makePart(g, split + 1, g.y1, inkLab, bw));
    }
  }
  const cands = parts.filter((p) => p.h >= 4).map((p) => candidateOf([p]));
  // Side-by-side pairs of parts: a "10" printed as two separate glyphs.
  const merged = new Set();
  for (const a of parts) {
    for (const b of parts) {
      if (a.comp === b.comp || a.color !== b.color || b.x0 <= a.x0) continue;
      const gap = b.x0 - a.x1 - 1;
      const hMax = Math.max(a.h, b.h);
      const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1;
      if (gap < -1 || gap > 0.45 * hMax) continue;
      if (overlap < 0.7 * Math.min(a.h, b.h) || Math.min(a.h, b.h) < 0.7 * hMax) continue;
      if (a.w > 0.8 * a.h) continue;
      cands.push(candidateOf([a, b]));
      merged.add(a);
      merged.add(b);
    }
  }
  // A lone "0" or "1" only matters as half of a split "10".
  for (const c of cands) c.splitPart = c.parts.length === 1 && merged.has(c.parts[0]);

  for (const cand of cands) describeCandidate(cand, ctxLocal);
  // A split "10" is also judged by its halves, which tolerates odd spacing.
  const single = new Map(cands.filter((c) => c.parts.length === 1).map((c) => [c.parts[0], c]));
  for (const cand of cands) {
    if (cand.parts.length !== 2 || !cand.cls) continue;
    const left = single.get(cand.parts[0]);
    const zero = single.get(cand.parts[1])?.cls;
    if (!left?.cls || !zero) continue;
    // At small sizes the "1" often degrades to a plain bar.
    const bar = left.w <= 0.3 * left.h ? 0.8 : -1;
    const byParts = Math.min(Math.max(left.cls.scores['1'], bar), zero.scores['0']) - 0.04;
    if (byParts > cand.cls.scores['10']) {
      cand.cls.scores['10'] = byParts;
      reviseRank(cand.cls);
    }
  }

  if (debug) {
    debug.regions.push({ id, x0, y0, x1: region.x1, y1: region.y1, paper, inkRef, glyphs: glyphs.length });
    for (const c of cands) {
      if (!c.cls) continue;
      debug.candidates.push({
        region: id, box: { x: x0 + c.bx0, y: y0 + c.by0, w: c.bx1 - c.bx0, h: c.by1 - c.by0 }, color: c.color,
        redness: c.parts.map((p) => Math.round(p.redness)), comps: c.parts.length,
        rank: c.cls.rank, suit: c.cls.suit, suit180: c.cls.suit180, other: c.cls.other, vec: c.vec, aspect: c.w / c.h,
      });
    }
  }
  return { region, cands: cands.filter((c) => c.cls), L: ctxLocal };
}

/**
 * Pair rank glyphs with their suit: 'stack' = suit printed below the rank (the
 * usual corner index), 'row' = suit to the right of the rank. For every rank
 * candidate the best-looking suit is chosen, then the most probable readings
 * are accepted first.
 */
function readIndices(rc, layout, debug) {
  const { region, cands, L } = rc;
  const features = layout === 'row' ? rowPairFeatures : pairFeatures;
  const discount = layout === 'row' ? 0.85 : 1;
  const entries = [];
  for (const r of cands) {
    if (r.cls.rank.score < 0.3) continue;
    const options = [];
    for (const s of cands) {
      if (s === r || s.color !== r.color || conflicts(r, s)) continue;
      const f = features(r, s, L);
      if (f) options.push({ s, f, pick: suitPick(f) });
    }
    if (!options.length) continue;
    options.sort((a, b) => b.pick - a.pick);
    entries.push({ r, options, p: rankProbability(options[0].f) * discount });
  }
  entries.sort((a, b) => b.p - a.p);
  if (debug && layout === 'stack') {
    for (const e of entries) {
      for (const o of e.options) {
        debug.pairs.push({
          box: { x: L.x0 + Math.min(e.r.bx0, o.s.bx0), y: L.y0 + e.r.by0, w: Math.max(e.r.bx1, o.s.bx1) - Math.min(e.r.bx0, o.s.bx0), h: o.s.by1 - e.r.by0 },
          rank: e.r.cls.rank.label, suit: o.s.cls.suit.label, f: o.f, score: rankProbability(o.f), first: o === e.options[0],
        });
      }
    }
  }
  const taken = [];
  const cards = [];
  for (const e of entries) {
    if (e.p < MIN_PROBABILITY) break;
    if (taken.some((t) => conflicts(t, e.r))) continue;
    const option = e.options.find((o) => !taken.some((t) => conflicts(t, o.s)));
    if (!option) continue;
    const p = rankProbability(option.f) * discount;
    if (p < MIN_PROBABILITY) continue;
    taken.push(e.r, option.s);
    cards.push(makeCard(e.r, option, p, region, L));
  }
  dropCentreArt(cards);
  return cards;
}

// Decks without a suit in the corner: accept clear rank glyphs at the very
// top of a card, with reduced confidence.
function readBareRanks(rc) {
  const { region, cands, L } = rc;
  const picks = [];
  for (const r of cands) {
    const { rank, suit, suit180 } = r.cls;
    if (rank.score < 0.6 || r.splitPart) continue;
    const col = columnExtent(L, r.cx, r.by0, r.by1);
    const cardH = col.bottom - col.top;
    const topFrac = (r.by0 - col.top) / cardH;
    const sizeFrac = r.h / cardH;
    if (topFrac > 0.12 || sizeFrac < 0.06 || sizeFrac > 0.3) continue;
    const f = {
      sr: rank.score, mrr: rank.score - rank.second, mrs: rank.score - Math.max(suit.score, suit180.score), mro: 0.5,
      ss: 0, mss: 0, msr: 0.1, gap: 0.2, dx: 0, top: topFrac, size: sizeFrac, ratio: 0.7,
    };
    const p = Math.min(0.6, rankProbability(f) * 0.6);
    if (p >= MIN_PROBABILITY) picks.push({ r, p });
  }
  picks.sort((a, b) => b.p - a.p);
  const taken = [];
  const cards = [];
  for (const { r, p } of picks) {
    if (taken.some((t) => conflicts(t, r))) continue;
    taken.push(r);
    cards.push(makeCard(r, null, p, region, L));
  }
  return cards;
}

// A glyph that touches the card outline gets flooded as "outside" together
// with the outline. Take back dark outside pixels that have this card's face
// within `reach` pixels on at least three of the four sides; an outline only
// has the face on one side.
function reclaimTouchingInk(state, bw, bh, isDark, reach) {
  const M = bw * bh;
  const cap = Math.min(255, reach + 1);
  const near = new Uint8Array(M);
  for (let y = 0; y < bh; y++) {
    const row = y * bw;
    let d = cap;
    for (let x = 0; x < bw; x++) {
      d = state[row + x] === 1 ? 0 : Math.min(cap, d + 1);
      if (d <= reach) near[row + x]++;
    }
    d = cap;
    for (let x = bw - 1; x >= 0; x--) {
      d = state[row + x] === 1 ? 0 : Math.min(cap, d + 1);
      if (d <= reach) near[row + x]++;
    }
  }
  for (let x = 0; x < bw; x++) {
    let d = cap;
    for (let y = 0; y < bh; y++) {
      const q = y * bw + x;
      d = state[q] === 1 ? 0 : Math.min(cap, d + 1);
      if (d <= reach) near[q]++;
    }
    d = cap;
    for (let y = bh - 1; y >= 0; y--) {
      const q = y * bw + x;
      d = state[q] === 1 ? 0 : Math.min(cap, d + 1);
      if (d <= reach) near[q]++;
    }
  }
  for (let q = 0; q < M; q++) {
    if (state[q] === 2 && near[q] >= 3 && isDark(q)) state[q] = 0;
  }
}

// Rows r0..r1 of component g, with the bounding box of its pixels there.
function makePart(g, r0, r1, inkLab, bw) {
  let x0 = Infinity;
  let x1 = -1;
  let y0 = Infinity;
  let y1 = -1;
  for (let y = r0; y <= r1; y++) {
    for (let x = g.x0; x <= g.x1; x++) {
      if (inkLab[y * bw + x] !== g.id) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { comp: g.id, r0, r1, color: g.color, redness: g.redness, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Where a rank and the suit below it touch, the joined shape has a thin or
// faint (anti-aliased only) row between them.
function findSplitRow(g, L) {
  const { inkLab, bw, luma, W, x0, y0, paper, inkRef } = L;
  if (g.h < 14 || g.h < 1.2 * g.w) return -1;
  const range = Math.max(40, paper - inkRef[g.color]);
  const count = [];
  const peak = [];
  for (let y = g.y0; y <= g.y1; y++) {
    let n = 0;
    let m = 0;
    for (let x = g.x0; x <= g.x1; x++) {
      if (inkLab[y * bw + x] !== g.id) continue;
      n++;
      const v = (paper - luma[(y0 + y) * W + x0 + x]) / range;
      if (v > m) m = v;
    }
    count.push(n);
    peak.push(Math.min(1, m));
  }
  const typical = median(count) || 1;
  let best = -1;
  let bestCost = Infinity;
  for (let i = Math.round(g.h * 0.4); i <= Math.round(g.h * 0.78); i++) {
    const cost = count[i] / typical + peak[i];
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
  }
  if (best < 0) return -1;
  const narrow = count[best] <= Math.max(1, 0.34 * typical);
  const faint = peak[best] <= 0.72;
  return narrow || faint ? g.y0 + best : -1;
}

function candidateOf(parts) {
  return {
    parts,
    color: parts[0].color,
    x0: Math.min(...parts.map((p) => p.x0)),
    y0: Math.min(...parts.map((p) => p.y0)),
    x1: Math.max(...parts.map((p) => p.x1)),
    y1: Math.max(...parts.map((p) => p.y1)),
  };
}

function conflicts(a, b) {
  for (const p of a.parts) {
    for (const q of b.parts) {
      if (p.comp === q.comp && p.r0 <= q.r1 && q.r0 <= p.r1) return true;
    }
  }
  return false;
}

function describeCandidate(cand, L) {
  const { W, x0, y0, bw, bh, luma, inkLab, state, paper, inkRef } = L;
  const pad = 2;
  const px0 = Math.max(0, cand.x0 - pad);
  const py0 = Math.max(0, cand.y0 - pad);
  const px1 = Math.min(bw - 1, cand.x1 + pad);
  const py1 = Math.min(bh - 1, cand.y1 + pad);
  const pw = px1 - px0 + 1;
  const ph = py1 - py0 + 1;
  const plane = new Float32Array(pw * ph);
  const ref = inkRef[cand.color];
  const range = Math.max(40, paper - ref);
  const own = (q) => {
    const l = inkLab[q];
    if (l === 0) return false;
    const y = (q / bw) | 0;
    for (const p of cand.parts) if (p.comp === l && y >= p.r0 && y <= p.r1) return true;
    return false;
  };
  for (let y = py0; y <= py1; y++) {
    for (let x = px0; x <= px1; x++) {
      const q = y * bw + x;
      let take = own(q);
      if (!take && inkLab[q] === 0 && state[q] === 0) {
        for (let dy = -1; dy <= 1 && !take; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= bh) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < bw && own(yy * bw + xx)) {
              take = true;
              break;
            }
          }
        }
      }
      if (!take) continue;
      const v = (paper - luma[(y0 + y) * W + x0 + x]) / range;
      plane[(y - py0) * pw + (x - px0)] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
  }
  const box = inkBounds(plane, pw, 0, 0, pw, ph, 0.1);
  if (!box) return;
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  if (h < 4 || w < 1) return;
  cand.bx0 = px0 + box.x0;
  cand.by0 = py0 + box.y0;
  cand.bx1 = px0 + box.x1;
  cand.by1 = py0 + box.y1;
  cand.w = w;
  cand.h = h;
  cand.cx = (cand.bx0 + cand.bx1) / 2;
  cand.vec = gridFeatures(plane, pw, ph, box);
  cand.cls = classifyGlyph(cand.vec, w / h);
}

function reviseRank(cls) {
  cls.ranking = cls.ranking.map((r) => ({ label: r.label, score: cls.scores[r.label] })).sort((a, b) => b.score - a.score);
  cls.rank = { label: cls.ranking[0].label, score: cls.ranking[0].score, second: cls.ranking[1].score };
}

// Vertical extent of the card surface (face + holes) through column lx.
function columnExtent(L, lx, ly0, ly1) {
  const { state, bw, bh } = L;
  const x = Math.max(0, Math.min(bw - 1, Math.round(lx)));
  let t = Math.max(0, Math.floor(ly0));
  while (t > 0 && state[(t - 1) * bw + x] !== 2) t--;
  let b = Math.min(bh - 1, Math.ceil(ly1));
  while (b < bh - 1 && state[(b + 1) * bw + x] !== 2) b++;
  return { top: t, bottom: b + 1 };
}

// Geometry gates and features for "rank r with suit s printed below it".
function pairFeatures(r, s, L) {
  const rh = r.h;
  const gap = s.by0 - r.by1;
  if (gap < -0.15 * rh || gap > 0.9 * rh) return null;
  const ratio = s.h / rh;
  if (ratio < 0.3 || ratio > 1.5) return null;
  const dx = Math.abs(s.cx - r.cx);
  if (dx > 0.5 * Math.max(r.w, s.w) + 0.1 * rh) return null;
  // Corner indices sit near the top of the card and are small relative to it.
  const col = columnExtent(L, r.cx, r.by0, s.by1);
  const cardH = col.bottom - col.top;
  const topFrac = (r.by0 - col.top) / cardH;
  const sizeFrac = rh / cardH;
  if (topFrac > 0.2 || sizeFrac > 0.27 || sizeFrac < 0.04) return null;
  const R = r.cls;
  const S = s.cls;
  if (!looksLikeSuit(S)) return null;
  return {
    sr: R.rank.score,
    mrr: R.rank.score - R.rank.second,
    mrs: R.rank.score - Math.max(R.suit.score, R.suit180.score),
    mro: r.splitPart ? R.rank.score - R.other.score : 0.5,
    ss: S.suit.score,
    mss: S.suit.score - S.suit.second,
    msr: S.suit.score - Math.max(S.rank.score, S.suit180.score, S.other.score),
    gap: gap / rh,
    dx: dx / rh,
    top: topFrac,
    size: sizeFrac,
    ratio,
  };
}

function looksLikeSuit(S) {
  return S.suit.score >= 0.45 && S.suit.score - Math.max(S.rank.score, S.suit180.score, S.other.score) >= -0.1;
}

// Same features for a suit printed to the right of the rank.
function rowPairFeatures(r, s, L) {
  const rh = r.h;
  const gap = s.bx0 - r.bx1;
  if (gap < -0.1 * rh || gap > 0.7 * rh) return null;
  const ratio = s.h / rh;
  if (ratio < 0.3 || ratio > 1.2) return null;
  const scy = (s.by0 + s.by1) / 2;
  if (scy < r.by0 + 0.2 * rh || scy > r.by1 + 0.1 * rh) return null;
  const col = columnExtent(L, r.cx, r.by0, r.by1);
  const cardH = col.bottom - col.top;
  const topFrac = (r.by0 - col.top) / cardH;
  const sizeFrac = rh / cardH;
  if (topFrac > 0.2 || sizeFrac > 0.3 || sizeFrac < 0.04) return null;
  const R = r.cls;
  const S = s.cls;
  if (!looksLikeSuit(S)) return null;
  return {
    sr: R.rank.score,
    mrr: R.rank.score - R.rank.second,
    mrs: R.rank.score - Math.max(R.suit.score, R.suit180.score),
    mro: r.splitPart ? R.rank.score - R.other.score : 0.5,
    ss: S.suit.score,
    mss: S.suit.score - S.suit.second,
    msr: S.suit.score - Math.max(S.rank.score, S.suit180.score, S.other.score),
    gap: gap / rh,
    dx: Math.abs(scy - (r.by0 + r.by1) / 2) / rh,
    top: topFrac,
    size: sizeFrac,
    ratio,
  };
}

// Logistic model of "the rank is read correctly", fitted on rendered tables
// (clean, JPEG and rescaled) and validated on held-out styles.
const MODEL = { bias: -9.1, sr: 12.2, mrr: 1.4, mrs: 4.7, mro: 9.5, msr: 1.2, gap: -6.1, dx: -9.4, lratio: -1.6 };

function rankProbability(f) {
  const clip = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const z = MODEL.bias
    + MODEL.sr * clip(f.sr, 0, 1)
    + MODEL.mrr * clip(f.mrr, -0.2, 0.35)
    + MODEL.mrs * clip(f.mrs, -0.3, 0.4)
    + MODEL.mro * clip(f.mro, -0.3, 0.3)
    + MODEL.msr * clip(f.msr, -0.3, 0.4)
    + MODEL.gap * clip(f.gap, -0.2, 1)
    + MODEL.dx * clip(f.dx, 0, 0.8)
    + MODEL.lratio * Math.abs(Math.log(clip(f.ratio, 0.2, 2) / 0.7));
  return 1 / (1 + Math.exp(-z));
}

// Which glyph below a rank is its suit: a clear suit shape, close and centred.
function suitPick(f) {
  return f.ss + 0.5 * Math.min(f.mss, 0.2) + 0.5 * Math.min(f.msr, 0.3) - 0.5 * Math.max(0, f.gap - 0.5) - Math.max(0, f.dx - 0.25);
}

function makeCard(r, option, p, region, L) {
  const s = option ? option.s : r;
  const bx0 = Math.min(r.bx0, s.bx0);
  const bx1 = Math.max(r.bx1, s.bx1);
  return {
    rank: r.cls.rank.label,
    // Spades and clubs blur together in tiny images; say so rather than guess.
    suit: !option || option.f.mss < 0.02 ? null : s.cls.suit.label,
    color: r.color,
    confidence: Math.round(p * 100) / 100,
    region: region.id,
    rankH: r.h,
    // working-resolution boxes, converted to original pixels in assemble()
    wbox: { x0: L.x0 + bx0, y0: L.y0 + Math.min(r.by0, s.by0), x1: L.x0 + bx1, y1: L.y0 + Math.max(r.by1, s.by1) },
    regionBox: { x0: region.x0, y0: region.y0, x1: region.x1, y1: region.y1 },
    alternatives: r.cls.ranking.slice(1, 3).map((a) => a.label),
  };
}

// Some decks repeat the rank and suit in large print in the middle of the card;
// that copy sits right of and below the real corner index.
function dropCentreArt(cards) {
  for (let i = cards.length - 1; i >= 0; i--) {
    const big = cards[i];
    const isCopy = cards.some((c) => c !== big && c.rank === big.rank && c.color === big.color
      && big.rankH >= 1.3 * c.rankH && big.wbox.x0 > c.wbox.x0 && big.wbox.y0 > c.wbox.y0
      && big.wbox.x0 - c.wbox.x1 < 6 * c.rankH);
    if (isCopy) cards.splice(i, 1);
  }
}


// Drop detections whose index size is far from the rest (decorations, artwork).
function suppressOutliers(cards) {
  if (cards.length < 3) return cards;
  const hs = cards.map((c) => c.rankH).sort((a, b) => a - b);
  const med = hs[hs.length >> 1];
  return cards.filter((c) => c.rankH <= med * 1.8 && c.rankH >= med * 0.45);
}

function assemble(found, geo) {
  const { toOrigX, toOrigY, origW, origH } = geo;
  const notes = [];
  const toBox = (b) => ({
    x: Math.round(b.x0 * toOrigX),
    y: Math.round(b.y0 * toOrigY),
    w: Math.round((b.x1 - b.x0) * toOrigX),
    h: Math.round((b.y1 - b.y0) * toOrigY),
  });
  if (!found.length) {
    notes.push('No cards were recognised. Make sure the top-left corner of each card (rank and suit) is visible, and try a larger or sharper screenshot.');
    return { width: origW, height: origH, cards: [], dealerUpCard: null, playerHands: [], notes, timingMs: 0 };
  }

  const hMed = median(found.map((c) => c.rankH));
  // Link cards of the same hand: same light region, or neighbouring regions side by side.
  const parent = found.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (let i = 0; i < found.length; i++) {
    for (let j = i + 1; j < found.length; j++) {
      const a = found[i];
      const b = found[j];
      if (a.region === b.region) { union(i, j); continue; }
      const A = a.regionBox;
      const B = b.regionBox;
      const gap = Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1);
      const vOverlap = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
      const minH = Math.min(A.y1 - A.y0, B.y1 - B.y0);
      if (gap <= 1.6 * hMed && vOverlap >= 0.5 * minH) union(i, j);
    }
  }
  const groupsMap = new Map();
  found.forEach((c, i) => {
    const root = find(i);
    if (!groupsMap.has(root)) groupsMap.set(root, []);
    groupsMap.get(root).push(c);
  });
  const groups = [...groupsMap.values()].map((cards) => {
    cards.sort((a, b) => a.wbox.x0 - b.wbox.x0);
    const ys = cards.map((c) => (c.wbox.y0 + c.wbox.y1) / 2);
    return { cards, cy: ys.reduce((a, b) => a + b, 0) / ys.length, x0: Math.min(...cards.map((c) => c.wbox.x0)) };
  });
  groups.sort((a, b) => a.cy - b.cy);

  let dealer = null;
  let players = groups;
  if (groups.length === 1) {
    notes.push("Only one group of cards found, so all cards were assigned to the player. Mark the dealer's card before analyzing.");
  } else {
    const top = groups[0];
    const sameLevel = groups.filter((g) => g.cy - top.cy < 2.5 * hMed);
    if (sameLevel.length === groups.length) {
      notes.push("All card groups are at the same height, so the dealer's hand could not be identified. All cards were assigned to the player; mark the dealer's card before analyzing.");
    } else if (sameLevel.length > 1) {
      const centre = geo.W / 2;
      dealer = sameLevel.reduce((best, g) => (Math.abs(g.x0 - centre) < Math.abs(best.x0 - centre) ? g : best));
      players = groups.filter((g) => g !== dealer);
      notes.push("More than one group of cards is at the dealer's height; the one closest to the middle was used as the dealer's hand.");
    } else {
      dealer = top;
      players = groups.slice(1);
    }
  }
  if (dealer) players = players.filter((g) => g !== dealer);
  players.sort((a, b) => a.x0 - b.x0);

  const out = (c, role, handIndex) => ({
    rank: c.rank,
    suit: c.suit,
    color: c.color,
    confidence: c.confidence,
    box: toBox(c.wbox),
    role,
    handIndex,
    alternatives: c.alternatives,
  });
  const cards = [];
  let dealerUpCard = null;
  if (dealer) {
    dealer.cards.forEach((c) => cards.push(out(c, 'dealer', 0)));
    dealerUpCard = cards[0];
    if (dealer.cards.length > 1) notes.push(`The dealer shows ${dealer.cards.length} face-up cards; the leftmost one is used as the up card.`);
  }
  const playerHands = players.map((g, h) => g.cards.map((c) => {
    const card = out(c, 'player', h);
    cards.push(card);
    return card;
  }));
  const unsure = cards.filter((c) => c.confidence < 0.8).length;
  if (unsure) notes.push(`${unsure} card${unsure > 1 ? 's were' : ' was'} hard to read. Please check ${unsure > 1 ? 'them' : 'it'} before analyzing.`);
  return { width: origW, height: origH, cards, dealerUpCard, playerHands, notes, timingMs: 0 };
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
}
