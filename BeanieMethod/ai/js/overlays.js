/* Captions and emoji stickers, drawn once as see-through pictures sized for a 1080-wide video. */

import { overlays } from "./engine/plan.js";

const TEXT_SIZES = { small: 58, medium: 78, big: 104 };
const STICKER_SIZES = { small: 170, medium: 260, big: 380 };
export const TEXT_COLORS = {
  white: "#ffffff", yellow: "#ffe600", red: "#ff3b3b", green: "#7cff4f", blue: "#4fc3ff",
  pink: "#ff5fd2", orange: "#ff9a1f", purple: "#b98cff", black: "#111111",
};
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji"';

function wrapText(g, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const tryLine = line ? `${line} ${w}` : w;
    if (g.measureText(tryLine).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = tryLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** A caption or emoji as a see-through canvas, sized for a 1080-wide video. */
export function drawOverlay(spec) {
  let c;
  if (spec.kind === "sticker") {
    const size = STICKER_SIZES[spec.size] || 260;
    const pad = Math.round(size * 0.28);
    c = new OffscreenCanvas(size + pad * 2, size + pad * 2);
    const g = c.getContext("2d");
    g.font = `${size}px ${EMOJI_FONT}, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = "rgba(0,0,0,.55)";
    g.shadowBlur = size * 0.08;
    g.shadowOffsetY = size * 0.03;
    g.fillText(spec.emoji, c.width / 2, c.height / 2 + size * 0.05);
  } else {
    const size = TEXT_SIZES[spec.size] || 78;
    const font = `900 ${size}px "Arial Black","Segoe UI Black","Segoe UI",Impact,${EMOJI_FONT},sans-serif`;
    const probe = new OffscreenCanvas(8, 8).getContext("2d");
    probe.font = font;
    const lines = wrapText(probe, spec.text, 940);
    const stroke = Math.max(6, Math.round(size * 0.16));
    const lineH = size * 1.2;
    const widest = Math.max(...lines.map((l) => probe.measureText(l).width));
    c = new OffscreenCanvas(Math.ceil(Math.min(1060, widest) + stroke * 2 + 24), Math.ceil(lines.length * lineH + stroke * 2 + 16));
    const g = c.getContext("2d");
    g.font = font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    lines.forEach((line, i) => {
      const y = stroke + 8 + lineH * (i + 0.5);
      g.shadowColor = "rgba(0,0,0,.45)";
      g.shadowBlur = 14;
      g.lineWidth = stroke;
      g.strokeStyle = spec.color === "black" ? "#ffffff" : "#000000";
      g.strokeText(line, c.width / 2, y, 1040);
      g.shadowBlur = 0;
      g.fillStyle = TEXT_COLORS[spec.color] || "#ffffff";
      g.fillText(line, c.width / 2, y, 1040);
    });
  }
  return c;
}

/** The pictures a plan needs, drawn once and kept. */
export class OverlayCache {
  constructor() {
    this.pics = new Map();
  }

  get(key) {
    return this.pics.get(key) || null;
  }

  /** Draw any caption/sticker pictures the plan needs that aren't drawn yet. */
  async prepare(plan) {
    const need = overlays(plan).filter((o) => !this.pics.has(o.key));
    if (!need.length) return;
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    for (const o of need) this.pics.set(o.key, drawOverlay(o.spec));
  }
}
