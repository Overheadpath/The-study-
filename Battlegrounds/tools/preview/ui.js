// Draws a Roblox ScreenGui snapshot (Sim.dumpGui JSON) on a canvas, over a backdrop image.
const params = new URLSearchParams(location.search);
const data = await (await fetch(params.get('json'))).json();
const [W, H] = data.viewport;
const canvas = document.createElement('canvas');
canvas.width = W; canvas.height = H;
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

await document.fonts.ready;
await Promise.all(['Bangers', 'Permanent Marker', 'Creepster'].map(f => document.fonts.load(`40px "${f}"`)));
await document.fonts.load('800 40px Montserrat');
await document.fonts.load('700 40px Montserrat');

if (params.get('bg')) {
  const img = new Image();
  img.src = params.get('bg');
  await img.decode();
  ctx.drawImage(img, 0, 0, W, H);
} else {
  ctx.fillStyle = '#556'; ctx.fillRect(0, 0, W, H);
}

const rgba = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

function fontFor(family, weight) {
  if (!family) return ['Montserrat', 700];
  if (family.includes('Bangers')) return ['Bangers', 400];
  if (family.includes('PermanentMarker')) return ['"Permanent Marker"', 400];
  if (family.includes('Creepster')) return ['Creepster', 400];
  if (family.includes('GothamSSm')) return ['Montserrat', weight === 'Heavy' || weight === 'Bold' ? 800 : 700];
  return ['Montserrat', 700];
}

function roundRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function gradientStyle(g, rect, alpha, tint) {
  const angle = (g.rotation || 0) * Math.PI / 180;
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const dx = Math.cos(angle) * rect.w / 2, dy = Math.sin(angle) * rect.h / 2;
  const lg = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  for (const k of g.keys) {
    const c = [k[1] * tint[0], k[2] * tint[1], k[3] * tint[2]];
    lg.addColorStop(Math.min(1, Math.max(0, k[0])), rgba(c, alpha));
  }
  return lg;
}

function stripRich(text) { return text.replace(/<[^>]+>/g, ''); }

function wrapLines(text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    }
    out.push(line);
  }
  return out;
}

function drawText(node, rect, k) {
  const text = node.rich ? stripRich(node.text) : node.text;
  if (!text) return;
  const [fam, weight] = fontFor(node.font, node.weight);
  const maxSize = Math.min(100, node.maxText || 100) * k;
  let size = Math.min(rect.h, maxSize);
  let lines;
  for (let i = 0; i < 40; i++) {
    ctx.font = `${weight} ${size}px ${fam}`;
    lines = node.wrap || text.includes('\n') ? wrapLines(text, rect.w) : [text];
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    const tall = lines.length * size * 1.1;
    if (widest <= rect.w + 0.5 && tall <= rect.h + 0.5) break;
    size *= 0.92;
  }
  ctx.font = `${weight} ${size}px ${fam}`;
  ctx.textBaseline = 'middle';
  const lineH = size * 1.1;
  const total = lines.length * lineH;
  let y0 = rect.y + rect.h / 2 - total / 2 + lineH / 2;
  if (node.ya === 'Top') y0 = rect.y + lineH / 2;
  if (node.ya === 'Bottom') y0 = rect.y + rect.h - total + lineH / 2;
  const alpha = 1 - (node.textT || 0);
  const tint = node.color;
  lines.forEach((line, i) => {
    let x = rect.x + rect.w / 2, align = 'center';
    if (node.xa === 'Left') { x = rect.x; align = 'left'; }
    if (node.xa === 'Right') { x = rect.x + rect.w; align = 'right'; }
    ctx.textAlign = align;
    const y = y0 + i * lineH;
    if (node.stroke && node.stroke.mode === 'Contextual' && node.stroke.thickness > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = node.stroke.thickness * 2 * k;
      ctx.strokeStyle = rgba(node.stroke.color, alpha * (1 - (node.stroke.t || 0)));
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = node.gradient ? gradientStyle(node.gradient, rect, alpha, tint) : rgba(tint, alpha);
    ctx.fillText(line, x, y);
  });
}

function childRects(node, rect, k) {
  // content area after padding
  const p = node.padding || [0, 0, 0, 0];
  const content = { x: rect.x + p[2] * k, y: rect.y + p[0] * k, w: rect.w - (p[2] + p[3]) * k, h: rect.h - (p[0] + p[1]) * k };
  const list = Array.isArray(node.children) ? node.children : Object.values(node.children || {});
  const kids = list.filter(c => c.visible !== false);
  const out = new Map();
  const sizeOf = (c, kk) => ({
    w: content.w * c.size[0] + c.size[1] * kk,
    h: content.h * c.size[2] + c.size[3] * kk,
  });
  if (node.list) {
    const sorted = [...kids].sort((a, b) => (a.order || 0) - (b.order || 0));
    const pad = node.list.pad[0] * (node.list.dir === 'Horizontal' ? content.w : content.h) + node.list.pad[1] * k;
    const sizes = sorted.map(c => { const s = sizeOf(c, k); const sc = c.scale || 1; return { w: s.w * sc, h: s.h * sc }; });
    if (node.list.dir === 'Horizontal') {
      const total = sizes.reduce((a, s) => a + s.w, 0) + pad * Math.max(0, sizes.length - 1);
      let x = content.x;
      if (node.list.h === 'Center') x = content.x + (content.w - total) / 2;
      if (node.list.h === 'Right') x = content.x + content.w - total;
      sorted.forEach((c, i) => {
        const s = sizes[i];
        let y = content.y;
        if (node.list.v === 'Center') y = content.y + (content.h - s.h) / 2;
        if (node.list.v === 'Bottom') y = content.y + content.h - s.h;
        out.set(c, { x, y, w: s.w, h: s.h, laid: true });
        x += s.w + pad;
      });
    } else {
      const total = sizes.reduce((a, s) => a + s.h, 0) + pad * Math.max(0, sizes.length - 1);
      let y = content.y;
      if (node.list.v === 'Center') y = content.y + (content.h - total) / 2;
      if (node.list.v === 'Bottom') y = content.y + content.h - total;
      sorted.forEach((c, i) => {
        const s = sizes[i];
        let x = content.x;
        if (node.list.h === 'Center') x = content.x + (content.w - s.w) / 2;
        if (node.list.h === 'Right') x = content.x + content.w - s.w;
        out.set(c, { x, y, w: s.w, h: s.h, laid: true });
        y += s.h + pad;
      });
    }
    return out;
  }
  if (node.grid) {
    const sorted = [...kids].sort((a, b) => (a.order || 0) - (b.order || 0));
    const cw = content.w * node.grid.cell[0] + node.grid.cell[1] * k;
    const ch = content.h * node.grid.cell[2] + node.grid.cell[3] * k;
    const px = content.w * node.grid.pad[0] + node.grid.pad[1] * k;
    const py = content.h * node.grid.pad[2] + node.grid.pad[3] * k;
    const cols = Math.max(1, Math.floor((content.w + px) / (cw + px)));
    sorted.forEach((c, i) => {
      out.set(c, { x: content.x + (i % cols) * (cw + px), y: content.y + Math.floor(i / cols) * (ch + py), w: cw, h: ch, laid: true });
    });
    return out;
  }
  for (const c of kids) {
    const s = sizeOf(c, k);
    const sc = c.scale || 1;
    const ax = content.x + content.w * c.pos[0] + c.pos[1] * k;
    const ay = content.y + content.h * c.pos[2] + c.pos[3] * k;
    const w = s.w * sc, h = s.h * sc;
    out.set(c, { x: ax - w * c.anchor[0], y: ay - h * c.anchor[1], w, h });
  }
  return out;
}

function draw(node, rect, parentK) {
  if (node.visible === false) return;
  const k = parentK * (node.scale || 1);
  ctx.save();
  if (node.rot) {
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    ctx.translate(cx, cy); ctx.rotate(node.rot * Math.PI / 180); ctx.translate(-cx, -cy);
  }
  const radius = node.corner ? node.corner[0] * Math.min(rect.w, rect.h) + node.corner[1] * k : 0;
  const isText = node.text !== undefined;
  if (node.bgT !== undefined && node.bgT < 1) {
    const alpha = 1 - node.bgT;
    ctx.fillStyle = node.gradient && !isText ? gradientStyle(node.gradient, rect, alpha, node.bg) : rgba(node.bg, alpha);
    if (node.gradient && isText && node.class !== 'TextLabel') ctx.fillStyle = gradientStyle(node.gradient, rect, alpha, node.bg);
    roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    ctx.fill();
  }
  if (node.stroke && node.stroke.mode === 'Border' && node.stroke.thickness > 0) {
    const t = node.stroke.thickness * k;
    ctx.lineWidth = t;
    ctx.strokeStyle = rgba(node.stroke.color, 1 - (node.stroke.t || 0));
    roundRect(rect.x - t / 2, rect.y - t / 2, rect.w + t, rect.h + t, radius + t / 2);
    ctx.stroke();
  }
  if (isText) {
    const textNode = node.gradient && node.class === 'TextLabel' ? node : { ...node, gradient: null };
    drawText(textNode, rect, k);
  }
  const kk = k;
  if (node.clip || node.class === 'ScrollingFrame') {
    roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    ctx.clip();
  }
  const rects = childRects(node, rect, kk);
  const ordered = [...rects.keys()].map((c, i) => [c, i]).sort((a, b) => ((a[0].z || 1) - (b[0].z || 1)) || (a[1] - b[1]));
  for (const [c] of ordered) draw(c, rects.get(c), kk);
  ctx.restore();
}

const guis = [...data.guis].sort((a, b) => (a.display || 0) - (b.display || 0));
for (const g of guis) {
  draw({ ...g, bgT: 1 }, { x: 0, y: 0, w: W, h: H }, 1);
}
window.uiReady = true;
