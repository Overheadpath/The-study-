// Approximate Roblox-style renderer for build/preview.json (parts + SurfaceGui text).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const params = new URLSearchParams(location.search);
const W = +(params.get('w') || 1280), H = +(params.get('h') || 720);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cb8d6);
const camera = new THREE.PerspectiveCamera(70, W / H, 0.3, 4000);

await document.fonts.ready;
await Promise.all(['Bangers', 'Permanent Marker', 'Creepster'].map(f => document.fonts.load(`40px "${f}"`)));
await document.fonts.load('800 40px Montserrat');
await document.fonts.load('700 40px Montserrat');

const data = await (await fetch('/data/preview.json')).json();

// ---------------------------------------------------------------- textures
function noiseCanvas(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(ctx, s, base, amount, count) {
  ctx.fillStyle = `rgb(${base},${base},${base})`; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < count; i++) {
    const v = base + (Math.random() - 0.5) * amount;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}
const TEX = {
  Brick: [noiseCanvas(256, (ctx, s) => {
    ctx.fillStyle = '#6f6f6f'; ctx.fillRect(0, 0, s, s);
    const rows = 8, cols = 4, bh = s / rows, bw = s / cols;
    for (let r = 0; r < rows; r++) for (let c = -1; c < cols + 1; c++) {
      const off = (r % 2) * bw / 2;
      const v = 215 + Math.random() * 40;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(c * bw + off + 2, r * bh + 2, bw - 4, bh - 4);
    }
  }), 4],
  WoodPlanks: [noiseCanvas(256, (ctx, s) => {
    for (let i = 0; i < 8; i++) {
      const v = 200 + Math.random() * 50;
      ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(0, i * s / 8, s, s / 8);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, i * s / 8, s, 2);
      ctx.fillRect(Math.random() * s, i * s / 8, 2, s / 8);
    }
  }), 8],
  Carpet: [noiseCanvas(128, (ctx, s) => speckle(ctx, s, 230, 50, 3000)), 6],
  Concrete: [noiseCanvas(128, (ctx, s) => speckle(ctx, s, 225, 40, 1500)), 8],
  Asphalt: [noiseCanvas(128, (ctx, s) => speckle(ctx, s, 220, 70, 4000)), 6],
  Slate: [noiseCanvas(128, (ctx, s) => speckle(ctx, s, 220, 60, 2000)), 8],
  Basalt: [noiseCanvas(128, (ctx, s) => speckle(ctx, s, 215, 80, 3000)), 8],
  Rock: [noiseCanvas(128, (ctx, s) => speckle(ctx, s, 215, 80, 3000)), 8],
  CrackedLava: [noiseCanvas(256, (ctx, s) => {
    ctx.fillStyle = '#301008'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#ffb060'; ctx.lineWidth = 3;
    for (let i = 0; i < 30; i++) { ctx.beginPath(); ctx.moveTo(Math.random() * s, Math.random() * s); for (let j = 0; j < 4; j++) ctx.lineTo(Math.random() * s, Math.random() * s); ctx.stroke(); }
  }), 30],
};

// ---------------------------------------------------------------- geometry
function tiledBox(sx, sy, sz, tile) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (!tile) return g;
  const uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const idx = f * 4 + i;
    uv.setXY(idx, uv.getX(idx) * dims[f][0] / tile, uv.getY(idx) * dims[f][1] / tile);
  }
  return g;
}
function wedgeGeometry(sx, sy, sz) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const A = [-hy, -hz], B = [-hy, hz], C = [hy, hz];
  const p = (x, yz) => [x, yz[0], yz[1]];
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  tri(p(-hx, A), p(-hx, C), p(-hx, B));
  tri(p(hx, A), p(hx, B), p(hx, C));
  quad(p(-hx, A), p(-hx, B), p(hx, B), p(hx, A));
  quad(p(-hx, B), p(-hx, C), p(hx, C), p(hx, B));
  quad(p(-hx, A), p(hx, A), p(hx, C), p(-hx, C));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function matrixFrom(cf) {
  const [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22] = cf;
  const m = new THREE.Matrix4();
  m.set(r00, r01, r02, x, r10, r11, r12, y, r20, r21, r22, z, 0, 0, 0, 1);
  return m;
}

// ---------------------------------------------------------------- materials
const matCache = new Map();
function materialFor(p, textured) {
  const key = `${p.m}|${p.c.join(',')}|${p.t}|${textured}`;
  if (matCache.has(key)) return matCache.get(key);
  const color = new THREE.Color().setRGB(p.c[0], p.c[1], p.c[2], THREE.SRGBColorSpace);
  let mat;
  if (p.m === 'Neon') {
    const c = color.clone().multiplyScalar(2.2);
    mat = new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  } else {
    const metal = ['Metal', 'Foil', 'DiamondPlate', 'CorrodedMetal'].includes(p.m);
    mat = new THREE.MeshStandardMaterial({
      color,
      roughness: p.m === 'Glass' ? 0.15 : p.m === 'Foil' ? 0.25 : metal ? 0.45 : p.m === 'SmoothPlastic' ? 0.55 : 0.9,
      metalness: p.m === 'Foil' ? 0.8 : metal ? 0.5 : 0,
      map: textured && TEX[p.m] ? TEX[p.m][0] : null,
    });
    if (p.m === 'CrackedLava') { mat.emissive = new THREE.Color(0xff5a10); mat.emissiveMap = TEX.CrackedLava[0]; mat.emissiveIntensity = 1.4; }
  }
  if (p.t > 0) { mat.transparent = true; mat.opacity = 1 - p.t; mat.depthWrite = p.t < 0.5; }
  matCache.set(key, mat);
  return mat;
}

const partMeshes = [];
const hideable = new Set(['Ceiling', 'SkyPanel', 'Beam', 'Cable']);
for (const p of data.parts) {
  if (p.t >= 1) { partMeshes.push(null); continue; }
  const [sx, sy, sz] = p.size;
  let geom, textured = false;
  if (p.mesh === 'Head') {
    geom = new THREE.CylinderGeometry(sx * 0.31 * 1.25, sx * 0.31 * 1.25, sy * 1.25, 20);
  } else if (p.s === 'Cylinder') {
    geom = new THREE.CylinderGeometry(sy / 2, sy / 2, sx, 32);
    geom.rotateZ(Math.PI / 2);
  } else if (p.s === 'Ball') {
    geom = new THREE.SphereGeometry(sx / 2, 24, 16);
  } else if (p.s === 'Wedge') {
    geom = wedgeGeometry(sx, sy, sz);
  } else {
    const tile = TEX[p.m] ? TEX[p.m][1] : 0;
    textured = !!tile;
    geom = tiledBox(sx, sy, sz, tile);
  }
  const mat = materialFor(p, textured);
  if (p.s === 'Wedge') mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(matrixFrom(p.cf));
  mesh.userData.name = p.n;
  scene.add(mesh);
  partMeshes.push(mesh);
}

// ---------------------------------------------------------------- surface guis
function fontFor(family) {
  if (!family) return ['sans-serif', 700];
  if (family.includes('Bangers')) return ['Bangers', 400];
  if (family.includes('PermanentMarker')) return ['"Permanent Marker"', 400];
  if (family.includes('Creepster')) return ['Creepster', 400];
  if (family.includes('GothamSSm') || family.includes('Montserrat')) return ['Montserrat', 800];
  return ['Montserrat', 700];
}
function rgba(c, a = 1) { return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`; }
function gradientFill(ctx, it, alpha) {
  const g = it.gradient;
  const angle = (g.rotation || 0) * Math.PI / 180;
  const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
  const dx = Math.cos(angle) * it.w / 2, dy = Math.sin(angle) * it.h / 2;
  const lg = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  for (const k of g.keys) lg.addColorStop(Math.min(1, Math.max(0, k[0])), rgba([k[1], k[2], k[3]], alpha));
  return lg;
}
function drawGuiCanvas(gui) {
  const scale = Math.min(1, 1400 / Math.max(gui.w, gui.h));
  const c = document.createElement('canvas');
  c.width = Math.max(4, Math.round(gui.w * scale)); c.height = Math.max(4, Math.round(gui.h * scale));
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  for (const it of gui.items) {
    ctx.save();
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    ctx.translate(cx, cy); ctx.rotate((it.rotation || 0) * Math.PI / 180); ctx.translate(-cx, -cy);
    if (it.bgT < 1 && !it.text) {
      ctx.fillStyle = it.gradient ? gradientFill(ctx, it, 1 - it.bgT) : rgba(it.bg, 1 - it.bgT);
      ctx.fillRect(it.x, it.y, it.w, it.h);
    } else if (it.bgT < 1) {
      ctx.fillStyle = rgba(it.bg, 1 - it.bgT); ctx.fillRect(it.x, it.y, it.w, it.h);
    }
    if (it.text) {
      const [fam, weight] = fontFor(it.font);
      let size = it.h;
      const pad = it.strokeW || 0;
      ctx.font = `${weight} ${size}px ${fam}`;
      let tw = ctx.measureText(it.text).width;
      if (tw > it.w - pad * 2) size = size * (it.w - pad * 2) / tw;
      size = Math.max(4, size * 0.92);
      ctx.font = `${weight} ${size}px ${fam}`;
      ctx.textBaseline = 'middle';
      let tx = cx, align = 'center';
      if (it.align === 'Left') { tx = it.x + pad; align = 'left'; }
      if (it.align === 'Right') { tx = it.x + it.w - pad; align = 'right'; }
      ctx.textAlign = align;
      const alpha = 1 - (it.textT || 0);
      if (it.stroke && it.strokeW > 0) {
        ctx.lineJoin = 'round'; ctx.lineWidth = it.strokeW * 2; ctx.strokeStyle = rgba(it.stroke, alpha);
        ctx.strokeText(it.text, tx, cy);
      }
      ctx.fillStyle = it.gradient ? gradientFill(ctx, it, alpha) : rgba(it.color, alpha);
      ctx.fillText(it.text, tx, cy);
    }
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const FACES = {
  Front: { n: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0], w: 0, h: 1, d: 2 },
  Back: { n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0], w: 0, h: 1, d: 2 },
  Right: { n: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0], w: 2, h: 1, d: 0 },
  Left: { n: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0], w: 2, h: 1, d: 0 },
  Top: { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], w: 0, h: 2, d: 1 },
  Bottom: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1], w: 0, h: 2, d: 1 },
};
for (const gui of data.guis) {
  const p = data.parts[gui.part - 1];
  if (!p || !gui.items.length) continue;
  const f = FACES[gui.face];
  const fw = p.size[f.w], fh = p.size[f.h], half = p.size[f.d] / 2;
  const geom = new THREE.PlaneGeometry(fw, fh);
  const mat = new THREE.MeshBasicMaterial({ map: drawGuiCanvas(gui), transparent: true, toneMapped: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  mat.color.setScalar(1.15);
  const mesh = new THREE.Mesh(geom, mat);
  const u = new THREE.Vector3(...f.u), v = new THREE.Vector3(...f.v).negate(), n = new THREE.Vector3(...f.n);
  const local = new THREE.Matrix4().makeBasis(u, v, n);
  local.setPosition(n.clone().multiplyScalar(half + 0.04));
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(matrixFrom(p.cf).multiply(local));
  mesh.renderOrder = 2;
  mesh.userData.name = 'gui:' + p.n;
  scene.add(mesh);
}

// ---------------------------------------------------------------- billboards
function billboardTexture(b) {
  const c = document.createElement('canvas');
  const pxPerStud = 48;
  c.width = Math.round(b.size[0] * pxPerStud); c.height = Math.round(b.size[1] * pxPerStud);
  const ctx = c.getContext('2d');
  const n = b.labels.length;
  b.labels.forEach((l, i) => {
    const [fam, weight] = fontFor(l.font);
    const rowH = i === 0 && n > 1 ? c.height * 0.58 : n > 1 ? c.height * 0.38 : c.height;
    const y = i === 0 ? rowH / 2 : c.height * 0.62 + rowH / 2;
    let size = rowH * 0.9;
    ctx.font = `${weight} ${size}px ${fam}`;
    const tw = ctx.measureText(l.text).width;
    if (tw > c.width * 0.96) size *= c.width * 0.96 / tw;
    ctx.font = `${weight} ${size}px ${fam}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, size * 0.12); ctx.strokeStyle = 'black'; ctx.lineJoin = 'round';
    ctx.strokeText(l.text, c.width / 2, y);
    ctx.fillStyle = rgba(l.color); ctx.fillText(l.text, c.width / 2, y);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
for (const b of data.billboards) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: billboardTexture(b), depthWrite: false }));
  s.position.set(...b.pos);
  s.scale.set(b.size[0], b.size[1], 1);
  s.userData.billboard = true;
  scene.add(s);
}

// ---------------------------------------------------------------- lights & glows
const amb = data.ambient;
scene.add(new THREE.AmbientLight(new THREE.Color(amb[0], amb[1], amb[2]), 2.2));
const hemi = new THREE.HemisphereLight(0xfff4e8, 0x302830, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0e0, 1.4);
sun.position.set(300, 800, 200);
scene.add(sun);

const glowTex = noiseCanvas(64, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
});
for (const e of data.emitters) {
  const m = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(e.color[0], e.color[1], e.color[2]).multiplyScalar(1.6), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const s = new THREE.Sprite(m);
  s.position.set(...e.pos);
  const k = e.fire ? 7 : 5;
  s.scale.set(k, k, 1);
  scene.add(s);
}
const pointLights = [];
for (const l of data.lights) {
  const light = new THREE.PointLight(new THREE.Color(l.color[0], l.color[1], l.color[2]), l.brightness * (l.kind === 'SurfaceLight' ? 60 : 40), l.range * 1.2, 1.2);
  light.position.set(...l.pos);
  if (l.kind === 'SurfaceLight') light.position.y -= 2;
  light.visible = false;
  scene.add(light);
  pointLights.push(light);
}

// ---------------------------------------------------------------- post
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

window.renderView = (view) => {
  camera.fov = view.fov || 70;
  camera.aspect = W / H;
  camera.position.set(...view.pos);
  camera.lookAt(new THREE.Vector3(...view.target));
  camera.updateProjectionMatrix();
  scene.background = new THREE.Color(view.sky || 0x9cb8d6);
  for (const mesh of partMeshes) if (mesh) mesh.visible = !(view.hideCeiling && hideable.has(mesh.userData.name));
  // Keep only the lights closest to what we're looking at (WebGL light limits).
  const focus = new THREE.Vector3(...view.target).lerp(new THREE.Vector3(...view.pos), 0.4);
  const sorted = [...pointLights].sort((a, b) => a.position.distanceTo(focus) - b.position.distanceTo(focus));
  pointLights.forEach(l => (l.visible = false));
  sorted.slice(0, view.lights || 14).forEach(l => (l.visible = true));
  composer.render();
  return true;
};
window.previewReady = true;
