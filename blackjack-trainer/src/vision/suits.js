// Vector suit symbols shared by the sample-table renderer and the glyph templates.
// Drawing them as paths (instead of the ♠♥♦♣ text glyphs) keeps the output
// identical on every platform and avoids emoji-style fallbacks.

/** Width / height ratio of each suit symbol. */
export const SUIT_ASPECT = { S: 0.9, H: 1.02, D: 0.78, C: 1.0 };

export const SUIT_VARIANTS = ['classic', 'round', 'sharp'];

/** Fill a suit symbol inside the box (x, y, w, h) with the current fillStyle. */
export function drawSuit(ctx, suit, x, y, w, h, variant = 'classic') {
  const px = (u) => x + u * w;
  const py = (v) => y + v * h;
  const sharp = variant === 'sharp';
  const round = variant === 'round';
  if (suit === 'H') {
    const notch = sharp ? 0.2 : round ? 0.28 : 0.24;
    const tip = sharp ? 0.6 : round ? 0.52 : 0.56;
    ctx.beginPath();
    ctx.moveTo(px(0.5), py(notch));
    ctx.bezierCurveTo(px(0.5), py(0.08), px(0.38), py(0), px(0.25), py(0));
    ctx.bezierCurveTo(px(0.1), py(0), px(0), py(0.12), px(0), py(0.3));
    ctx.bezierCurveTo(px(0), py(tip), px(0.3), py(0.74), px(0.5), py(1));
    ctx.bezierCurveTo(px(0.7), py(0.74), px(1), py(tip), px(1), py(0.3));
    ctx.bezierCurveTo(px(1), py(0.12), px(0.9), py(0), px(0.75), py(0));
    ctx.bezierCurveTo(px(0.62), py(0), px(0.5), py(0.08), px(0.5), py(notch));
    ctx.closePath();
    ctx.fill();
  } else if (suit === 'D') {
    const bow = sharp ? 0.5 : round ? 0.26 : 0.34;
    ctx.beginPath();
    ctx.moveTo(px(0.5), py(0));
    ctx.quadraticCurveTo(px(0.5 + bow / 2), py(bow * 0.8), px(1), py(0.5));
    ctx.quadraticCurveTo(px(0.5 + bow / 2), py(1 - bow * 0.8), px(0.5), py(1));
    ctx.quadraticCurveTo(px(0.5 - bow / 2), py(1 - bow * 0.8), px(0), py(0.5));
    ctx.quadraticCurveTo(px(0.5 - bow / 2), py(bow * 0.8), px(0.5), py(0));
    ctx.closePath();
    ctx.fill();
  } else if (suit === 'S') {
    const lobe = round ? 0.86 : 0.83;
    ctx.beginPath();
    ctx.moveTo(px(0.5), py(0));
    ctx.bezierCurveTo(px(sharp ? 0.4 : 0.34), py(0.2), px(0), py(0.36), px(0), py(0.6));
    ctx.bezierCurveTo(px(0), py(0.76), px(0.14), py(lobe), px(0.28), py(lobe));
    ctx.bezierCurveTo(px(0.38), py(lobe), px(0.45), py(0.79), px(0.47), py(0.74));
    ctx.bezierCurveTo(px(0.46), py(0.86), px(0.4), py(0.95), px(0.28), py(1));
    ctx.lineTo(px(0.72), py(1));
    ctx.bezierCurveTo(px(0.6), py(0.95), px(0.54), py(0.86), px(0.53), py(0.74));
    ctx.bezierCurveTo(px(0.55), py(0.79), px(0.62), py(lobe), px(0.72), py(lobe));
    ctx.bezierCurveTo(px(0.86), py(lobe), px(1), py(0.76), px(1), py(0.6));
    ctx.bezierCurveTo(px(1), py(0.36), px(sharp ? 0.6 : 0.66), py(0.2), px(0.5), py(0));
    ctx.closePath();
    ctx.fill();
  } else if (suit === 'C') {
    const r = round ? 0.235 : sharp ? 0.2 : 0.22;
    const leaf = (u, v) => {
      ctx.beginPath();
      ctx.ellipse(px(u), py(v), r * w, r * h, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    leaf(0.5, r + 0.01);
    leaf(r + 0.01, 0.58);
    leaf(1 - r - 0.01, 0.58);
    ctx.beginPath();
    ctx.moveTo(px(0.5), py(0.3));
    ctx.lineTo(px(0.32), py(0.6));
    ctx.lineTo(px(0.68), py(0.6));
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px(0.46), py(0.55));
    ctx.bezierCurveTo(px(0.45), py(0.8), px(0.38), py(0.93), px(0.27), py(1));
    ctx.lineTo(px(0.73), py(1));
    ctx.bezierCurveTo(px(0.62), py(0.93), px(0.55), py(0.8), px(0.54), py(0.55));
    ctx.closePath();
    ctx.fill();
  }
}
