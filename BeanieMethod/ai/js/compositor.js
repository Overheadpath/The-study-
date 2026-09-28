/* Drawing one frame of the finished video. The live preview and the export both use this,
 * so what you see is what you get.
 *
 *  1. zoom / shake: which part of the gameplay picture to show
 *  2. layout: 9:16 with a blurred copy behind it, cropped to fill, black bars, or original shape
 *  3. color look, black & white freezes, flashes
 *  4. captions and emoji stickers pop in on top
 */

import { overlayKey } from "./engine/plan.js";

export const EXPORT_WIDTH = 1080;

const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Size of the finished video: [width, height]. */
export function canvasSize(plan, info, scale = 1) {
  let w;
  let h;
  if (plan.format === "vertical") [w, h] = [1080, 1920];
  else if (plan.format === "square") [w, h] = [1080, 1080];
  else if (info.width >= info.height) {
    h = Math.min(1080, info.height);
    w = (info.width * h) / info.height;
  } else {
    w = Math.min(1080, info.width);
    h = (info.height * w) / info.width;
  }
  return [even(w * scale), even(h * scale)];
}

export function outputFps(info) {
  return info.fps >= 50 ? 60 : 30;
}

/** Where the gameplay picture sits on the canvas. */
export class Layout {
  constructor(plan, info, [cw, ch]) {
    this.cw = cw;
    this.ch = ch;
    this.fmt = plan.format || "vertical";
    this.fit = this.fmt !== "original" ? (plan.fit || "blur") : "fill";
    if (this.fit === "blur" || this.fit === "bars") {
      const s = Math.min(cw / info.width, ch / info.height);
      this.content = [even(info.width * s), even(info.height * s)];
    } else {
      this.content = [cw, ch];
    }
    this.cropAspect = this.fit === "crop" ? cw / ch : null;
    this.x = (cw - this.content[0]) / 2;
    this.y = (ch - this.content[1]) / 2;
  }

  /** Center point for a caption or sticker at top / middle / bottom. */
  center(position) {
    if (position === "middle") return [this.cw / 2, this.ch / 2];
    const space = this.fit === "blur" || this.fit === "bars" ? this.y : 0;
    const roomy = space >= 0.12 * this.ch;
    if (position === "top") return [this.cw / 2, roomy ? space / 2 : 0.14 * this.ch];
    return [this.cw / 2, roomy ? this.ch - space / 2 : 0.86 * this.ch];
  }
}

/** 1 during [start, start+length], ramping in and out; 0 elsewhere. */
export function windowAt(t, start, length, ramp = 0.15) {
  const r = Math.max(0.03, Math.min(ramp, length / 3));
  return clamp((t - start) / r, 0, 1) * clamp((start + length - t) / r, 0, 1);
}

const TEXT_POP = (t) => (t < 0.1 ? 0.7 + 3.5 * t : t < 0.18 ? 1.05 - 0.625 * (t - 0.1) : 1);
const STICKER_POP = (t) => (t < 0.12 ? 0.3 + 7.0833 * t : t < 0.22 ? 1.15 - 1.5 * (t - 0.12) : 1);

export const COLOR_LOOKS = {
  none: { filter: "", tint: null },
  vibrant: { filter: "saturate(1.45) contrast(1.08)", tint: null },
  cinematic: { filter: "contrast(1.12) saturate(0.92)", tint: "rgba(0, 110, 140, 0.22)" },
  bw: { filter: "grayscale(1) contrast(1.15)", tint: null },
  warm: { filter: "saturate(1.1) sepia(0.12)", tint: "rgba(255, 150, 60, 0.22)" },
  cold: { filter: "saturate(0.95)", tint: "rgba(60, 140, 255, 0.26)" },
  retro: { filter: "sepia(0.35) saturate(0.85) contrast(1.05)", tint: "rgba(255, 190, 120, 0.12)", grain: true },
};

let grainTile = null;
function grain() {
  if (!grainTile) {
    grainTile = new OffscreenCanvas(256, 256);
    const g = grainTile.getContext("2d");
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  return grainTile;
}

/**
 * Everything about a plan that doesn't change from frame to frame.
 * info: the clip ({width, height, duration}); scale: 1 for export, less for the preview.
 */
export class Scene {
  constructor(plan, info, timeline, { scale = 1, overlays = null } = {}) {
    this.plan = plan;
    this.info = info;
    this.timeline = timeline;
    this.size = canvasSize(plan, info, scale);
    this.overlayScale = this.size[0] / canvasSize(plan, info, 1)[0];
    this.layout = new Layout(plan, info, this.size);
    this.look = COLOR_LOOKS[plan.color] || COLOR_LOOKS.none;
    this.overlays = overlays;  // OverlayCache
    const place = (at, len) => timeline.place(at, len);
    this.zooms = (plan.zoom || []).map((z) => {
      const [s, e] = place(z.at, z.duration);
      return { s, len: e - s, amount: z.amount, x: z.x, y: z.y };
    });
    this.shakes = (plan.shake || []).map((sh) => {
      const [s, e] = place(sh.at, sh.duration);
      return { s, len: e - s, strength: sh.strength };
    });
    this.flashes = (plan.flash || []).map((fl) => place(fl.at, 0.4)[0]);
    this.items = [];
    for (const kind of ["text", "sticker"]) {
      for (const item of plan[kind] || []) {
        const [s, e] = place(item.at, item.duration);
        if (e - s >= 0.05) this.items.push({ kind, key: overlayKey(kind, item), s, e, position: item.position });
      }
    }
    const [cw, ch] = this.size;
    this.bgSize = [Math.max(2, Math.round(cw / 10)), Math.max(2, Math.round(ch / 10))];
    this.bg = null;
  }

  /** Zoom amount and where it points, at finished-video time t. */
  camera(t) {
    let z = 0;
    let fx = 0.5;
    let fy = 0.5;
    for (const zm of this.zooms) {
      const w = windowAt(t, zm.s, zm.len);
      if (!w) continue;
      z += (zm.amount - 1) * w;
      fx += (zm.x - 0.5) * w;
      fy += (zm.y - 0.5) * w;
    }
    for (const sh of this.shakes) {
      const w = windowAt(t, sh.s, sh.len, 0.05);
      if (!w) continue;
      z += 0.06 * sh.strength * w;
      fx += 0.45 * w * Math.sin(2 * Math.PI * 13 * t);
      fy += 0.45 * w * Math.cos(2 * Math.PI * 17 * t);
    }
    return { zoom: 1 + z, fx: clamp(fx, 0, 1), fy: clamp(fy, 0, 1) };
  }

  /** The part of the source picture (sw x sh) to show at time t: [x, y, w, h]. */
  sourceRect(t, sw, sh) {
    let rx = 0;
    let ry = 0;
    let rw = sw;
    let rh = sh;
    if (this.layout.cropAspect) {
      const a = this.layout.cropAspect;
      rw = Math.min(sw, sh * a);
      rh = Math.min(sh, sw / a);
      rx = (sw - rw) * clamp(this.plan.focus_x ?? 0.5, 0, 1);
      ry = (sh - rh) / 2;
    }
    const cam = this.camera(t);
    if (cam.zoom <= 1.0001) return [rx, ry, rw, rh];
    const zw = rw / cam.zoom;
    const zh = rh / cam.zoom;
    return [rx + (rw - zw) * cam.fx, ry + (rh - zh) * cam.fy, zw, zh];
  }

  flashAt(t) {
    let v = 0;
    for (const t0 of this.flashes) if (t >= t0 && t <= t0 + 0.6) v += 0.85 * Math.exp(-9 * (t - t0));
    return Math.min(0.85, v);
  }

  /**
   * Draw the frame at finished-video time t.
   * src: anything drawImage takes (video element, VideoFrame, canvas), upright, sw x sh pixels.
   * bw: this frame is part of a black & white freeze.
   */
  draw(ctx, src, sw, sh, t, bw = false) {
    const [cw, ch] = this.size;
    const L = this.layout;
    const [x, y, w, h] = this.sourceRect(t, sw, sh);
    const look = this.look.filter + (bw ? " grayscale(1)" : "");
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (L.fit === "blur") {
      this.drawBackground(ctx, src, [x, y, w, h], look);
    } else if (L.fit === "bars" || !src) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cw, ch);
    }
    if (src) {
      ctx.filter = look.trim() || "none";
      ctx.drawImage(src, x, y, w, h, L.x, L.y, L.content[0], L.content[1]);
      ctx.filter = "none";
    }
    const area = L.fit === "bars" ? [L.x, L.y, L.content[0], L.content[1]] : [0, 0, cw, ch];
    if (this.look.tint && !bw) {
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = this.look.tint;
      ctx.fillRect(...area);
      ctx.globalCompositeOperation = "source-over";
    }
    if (this.look.grain) {
      ctx.globalAlpha = 0.07;
      ctx.globalCompositeOperation = "overlay";
      const tile = grain();
      const ox = -Math.floor(Math.random() * 256);
      const oy = -Math.floor(Math.random() * 256);
      for (let gx = ox; gx < cw; gx += 256) for (let gy = oy; gy < ch; gy += 256) ctx.drawImage(tile, gx, gy);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    const flash = this.flashAt(t);
    if (flash > 0.001) {
      ctx.fillStyle = `rgba(255,255,255,${flash.toFixed(3)})`;
      ctx.fillRect(...area);
    }
    this.drawOverlays(ctx, t);
    ctx.restore();
  }

  drawBackground(ctx, src, [x, y, w, h], look) {
    const [cw, ch] = this.size;
    if (!src) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cw, ch);
      return;
    }
    // cover the canvas with the same picture: the middle part with the canvas's shape
    const a = cw / ch;
    let bw = w;
    let bh = w / a;
    if (bh > h) {
      bh = h;
      bw = h * a;
    }
    const bx = x + (w - bw) / 2;
    const by = y + (h - bh) / 2;
    if (!this.bg) {
      this.bg = new OffscreenCanvas(...this.bgSize);
      this.bgCtx = this.bg.getContext("2d");
    }
    const [gw, gh] = this.bgSize;
    this.bgCtx.filter = "blur(3.5px)";
    this.bgCtx.drawImage(src, bx, by, bw, bh, 0, 0, gw, gh);
    this.bgCtx.filter = "none";
    ctx.filter = `${look} brightness(0.9) saturate(1.15)`.trim();
    ctx.drawImage(this.bg, 0, 0, gw, gh, 0, 0, cw, ch);
    ctx.filter = "none";
  }

  drawOverlays(ctx, t) {
    if (!this.overlays) return;
    const [cw, ch] = this.size;
    for (const item of this.items) {
      if (t < item.s || t > item.e) continue;
      const pic = this.overlays.get(item.key);
      if (!pic) continue;
      const pop = (item.kind === "text" ? TEXT_POP : STICKER_POP)(t - item.s);
      const w = Math.max(2, pic.width * this.overlayScale * pop);
      const h = (pic.height * w) / pic.width;
      const [cx, cy] = this.layout.center(item.position);
      const dx = clamp(cx - w / 2, 0, Math.max(0, cw - w));
      const dy = clamp(cy - h / 2, 0, Math.max(0, ch - h));
      ctx.drawImage(pic, dx, dy, w, h);
    }
  }
}
