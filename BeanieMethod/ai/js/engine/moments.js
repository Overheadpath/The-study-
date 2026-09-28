/* Finding the moments that matter in a clip: loading screens, menus, loud sounds, big changes.
 *
 * The browser decodes the clip once and feeds small frames (10 per second) and the sound here:
 *   - how bright each frame is (menus are bright, loading screens dark)
 *   - dark screens (loading) and parts where nothing moves (menus, AFK)
 *   - big changes on screen
 *   - loudness every 0.1 s (steals, hits and alarms are loud)
 * These follow what ffmpeg's blackdetect, freezedetect, select=scene and astats do.
 */

const NOISE = 10 ** (-48 / 20);   // freezedetect n=-48dB: "the same picture"
const FREEZE_MIN = 1.5;           // seconds
const BLACK_MIN = 0.3;            // seconds
const BLACK_PIXEL = 16 + 0.10 * 219;  // limited-range luma a "black" pixel is under
const BLACK_PICTURE = 0.92;       // share of black pixels for a black frame

/** Luma plane (limited range 16-235 like video) from canvas RGBA pixels. */
export function lumaPlane(rgba, count) {
  const out = new Uint8Array(count);
  for (let i = 0, j = 0; i < count; i++, j += 4) {
    out[i] = 16 + ((0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) * 219) / 255 + 0.5;
  }
  return out;
}

function meanAbsDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Collects frame facts one frame at a time (frames must come in time order). */
export class VideoAnalyzer {
  constructor(frameInterval = 0.1) {
    this.interval = frameInterval;
    this.luma = [];     // [t, average brightness]
    this.scene = [];    // [t, change score 0-1]
    this.black = [];    // [start, end]
    this.freeze = [];   // [start, end]
    this.prev = null;
    this.prevMafd = 0;
    this.blackStart = null;
    this.ref = null;    // first frame of a possible freeze
    this.refT = 0;
    this.lastT = 0;
  }

  push(t, plane) {
    let sum = 0;
    let dark = 0;
    for (let i = 0; i < plane.length; i++) {
      sum += plane[i];
      if (plane[i] <= BLACK_PIXEL) dark += 1;
    }
    this.luma.push([t, sum / plane.length]);

    // big changes (select=scene): mean difference, minus the change a frame before
    if (this.prev) {
      const mafd = (meanAbsDiff(plane, this.prev) * 100) / 256;
      const score = Math.max(0, Math.min(1, Math.min(mafd, Math.abs(mafd - this.prevMafd)) / 100));
      this.prevMafd = mafd;
      this.scene.push([t, score]);
    }
    this.prev = plane;

    // dark screens (blackdetect)
    const isBlack = dark / plane.length >= BLACK_PICTURE;
    if (isBlack && this.blackStart === null) this.blackStart = t;
    if (!isBlack && this.blackStart !== null) {
      if (t - this.blackStart >= BLACK_MIN) this.black.push([this.blackStart, t]);
      this.blackStart = null;
    }

    // nothing moving (freezedetect): compared with the first frame of the still part
    if (this.ref && meanAbsDiff(plane, this.ref) / 255 <= NOISE) {
      // still frozen
    } else {
      if (this.ref && this.lastT - this.refT >= FREEZE_MIN - 1e-9) this.freeze.push([this.refT, t]);
      this.ref = plane;
      this.refT = t;
    }
    this.lastT = t;
  }

  finish(duration) {
    const end = Math.min(duration, this.lastT + this.interval);
    if (this.blackStart !== null && end - this.blackStart >= BLACK_MIN) this.black.push([this.blackStart, end]);
    if (this.ref && this.lastT - this.refT >= FREEZE_MIN - 1e-9) this.freeze.push([this.refT, duration]);
    this.blackStart = null;
    this.ref = null;
    return { luma: this.luma, scene: this.scene, black: this.black, freeze: this.freeze };
  }
}

/** Loudness (RMS in dB, like astats) for every 0.1 s window of sound. */
export class AudioAnalyzer {
  constructor(sampleRate, window = 0.1) {
    this.rate = sampleRate;
    this.size = Math.max(1, Math.round(sampleRate * window));
    this.window = window;
    this.sum = 0;
    this.n = 0;
    this.index = 0;
    this.levels = [];  // [t, dB]
  }

  /** channels: Float32Array per channel, all the same length, following the last push. */
  push(channels) {
    const len = channels[0].length;
    const k = channels.length;
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (let c = 0; c < k; c++) s += channels[c][i] * channels[c][i];
      this.sum += s / k;
      this.n += 1;
      if (this.n === this.size) this.flush();
    }
  }

  flush() {
    if (!this.n) return;
    const rms = Math.sqrt(this.sum / this.n);
    this.levels.push([this.index * this.window, rms > 0 ? 20 * Math.log10(rms) : -Infinity]);
    this.index += 1;
    this.sum = 0;
    this.n = 0;
  }

  finish() {
    if (this.n >= this.size / 2) this.flush();
    return this.levels;
  }
}

const finite = (v) => Number.isFinite(v);

function mean(values) {
  const v = values.filter(finite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function median(values) {
  const v = values.filter(finite).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Best-scoring candidates at least `spacing` seconds apart. */
function spaced(candidates, spacing, limit) {
  const chosen = [];
  for (const c of [...candidates].sort((a, b) => b.score - a.score)) {
    if (chosen.every((o) => Math.abs(c.t - o.t) >= spacing)) chosen.push(c);
    if (chosen.length >= limit) break;
  }
  return chosen.sort((a, b) => a.t - b.t);
}

const inside = (t, spans, pad = 0) => spans.some(([a, b]) => a - pad <= t && t <= b + pad);
const r2 = (x) => Math.round(x * 100) / 100;
const r1 = (x) => Math.round(x * 10) / 10;

export function findMoments(duration, scene, black, freeze, luma, audio) {
  const moments = [];
  black = black.filter(([a, b]) => b - a >= 0.3);
  for (const [a, b] of black) moments.push({ t: r2(a), end: r2(b), kind: "dark", label: "Dark screen (loading?)" });

  const stills = [];
  for (const [a, b] of freeze) {
    if (b - a < 1.5 || black.some(([ba, bb]) => a >= ba - 0.2 && b <= bb + 0.2)) continue;
    const brightness = mean(luma.filter(([t]) => a <= t && t <= b).map(([, v]) => v));
    let label = "Nothing moving";
    if (brightness !== null && brightness > 150) label = "Still, bright screen (menu or home page?)";
    else if (brightness !== null && brightness < 35) label = "Still, dark screen (loading?)";
    stills.push([a, b]);
    moments.push({ t: r2(a), end: r2(b), kind: "still", label });
  }

  const dead = [...black, ...stills];

  const cuts = scene.filter(([t, s]) => s >= 0.3 && t > 0.2 && t < duration - 0.2).map(([t, s]) => ({ t, score: s }));
  const spacedCuts = spaced(cuts, 1.0, 8);
  for (const c of spacedCuts) {
    moments.push({ t: r2(c.t), kind: "change", score: r2(c.score), label: "Big change on screen" });
  }

  const loudCandidates = [];
  const fin = audio.filter(([, v]) => finite(v));
  const med = median(fin.map(([, v]) => v));
  if (med !== null) {
    fin.forEach(([t, v], i) => {
      if (v < -32 || v < med + 8) return;
      const window = fin.filter(([tt]) => Math.abs(tt - t) <= 0.6).map(([, w]) => w);
      if (v < Math.max(...window)) return;
      // Report when the sound starts, not its loudest point: edits should hit on the onset.
      let onset = t;
      for (let j = i - 1; j >= 0; j--) {
        const [tt, w] = fin[j];
        if (t - tt > 0.8 || w < v - 6) break;
        onset = tt;
      }
      const before = mean(fin.filter(([tt]) => onset - 1.0 <= tt && tt < onset - 0.05).map(([, w]) => w));
      const jump = before !== null ? v - before : 0;
      const score = (v - med) + Math.max(0, jump);
      loudCandidates.push({ t: onset, score, db: v, jump });
    });
  }
  const louds = spaced(loudCandidates, 1.2, 8);
  for (const c of louds) {
    moments.push({ t: r2(c.t), kind: "loud", score: r1(c.score), label: c.jump >= 10 ? "Sudden loud sound" : "Loud sound" });
  }

  moments.sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));

  let deadStart = 0;
  for (const [a, b] of [...dead].sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    if (a <= deadStart + 0.5) deadStart = Math.max(deadStart, b);
  }
  deadStart = deadStart > 0.3 ? r2(deadStart) : 0;
  let deadEnd = null;
  for (const [a, b] of [...dead].sort((x, y) => y[1] - x[1])) {
    if (b >= duration - 0.5 && a > deadStart) {
      deadEnd = r2(a);
      break;
    }
  }

  let highlight = null;
  const liveLouds = louds.filter((c) => !inside(c.t, dead, 0.2));
  const liveCuts = spacedCuts.filter((c) => !inside(c.t, dead, 0.2));
  const best = (list) => list.reduce((a, b) => (b.score > a.score ? b : a));
  if (liveLouds.length) highlight = best(liveLouds).t;
  else if (liveCuts.length) highlight = best(liveCuts).t;
  return {
    moments,
    dead_start: deadStart,
    dead_end: deadEnd,
    highlight: highlight !== null ? r2(highlight) : null,
  };
}

const f1 = (x) => Number(x).toFixed(1);
const gfmt = (x) => String(Number(Number(x).toPrecision(6)));

/** A short text about the clip for the AI to read. */
export function describe(info, analysis, markers = null, vision = null) {
  const lines = [`Clip: ${f1(info.duration)} s long, ${info.width}x${info.height}, ${gfmt(info.fps)} fps, `
    + `${info.has_audio ? "with" : "no"} sound.`];
  if (analysis) {
    const found = analysis.moments || [];
    if (found.length) {
      lines.push("Things I noticed (times are in the original clip):");
      for (const m of found.slice(0, 14)) {
        const when = m.end !== undefined ? `${f1(m.t)}-${f1(m.end)} s` : `${f1(m.t)} s`;
        lines.push(`- ${when}: ${m.label}`);
      }
    }
    if (analysis.dead_start) lines.push(`Boring start (loading/menu) ends at ${f1(analysis.dead_start)} s.`);
    if (analysis.dead_end !== null && analysis.dead_end !== undefined) {
      lines.push(`Boring ending (menu/nothing moving) starts at ${f1(analysis.dead_end)} s.`);
    }
    if (analysis.highlight !== null && analysis.highlight !== undefined) {
      lines.push(`My best guess for the main moment: ${f1(analysis.highlight)} s.`);
    }
  }
  if (markers && markers.length) {
    lines.push("Moments the user marked:");
    for (const mk of markers) lines.push(`- "${mk.label}" at ${f1(mk.t)} s`);
  }
  if (vision && vision.length) {
    lines.push("What I saw when I watched the clip:");
    for (const v of vision.slice(0, 24)) lines.push(`- ${f1(v.t)} s: ${v.what}`);
  }
  return lines.join("\n");
}
