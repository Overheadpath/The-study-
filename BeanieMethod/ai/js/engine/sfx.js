/* Built-in sound effects, made from math (no copyrighted meme sounds).
 *
 * Each sound is a formula of time t (seconds). synthesize() turns one into samples,
 * filters it and brings every sound to the same peak level so none is too loud or quiet.
 * People can also add their own sound files (they live in the editor's storage).
 */

export const SAMPLE_RATE = 48000;
export const PEAK_DB = -4.0;

const PI = Math.PI;
const TAU = 2 * Math.PI;

/** Phase (in cycles) of a tone that slides from fStart to fEnd. */
const chirp = (t, fEnd, fStart, k) => fEnd * t + (fStart - fEnd) * (1 - Math.exp(-k * t)) / k;

const between = (t, a, b) => (t >= a && t <= b ? 1 : 0);
const gte = (t, a) => (t >= a ? 1 : 0);

/** 1 inside [start, end] with a quick fade in and out. */
const env = (t, start, end, attack = 40, release = 14) =>
  between(t, start, end) * Math.min(1, (t - start) * attack) * Math.min(1, (end - t) * release);

/** A small repeatable random generator (sounds come out the same every time). */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function failHorn(t) {
  const notes = [[0.0, 0.42, 233.08], [0.48, 0.9, 220.0], [0.96, 1.38, 207.65], [1.44, 2.85, 196.0]];
  let sum = 0;
  notes.forEach(([s, e, f], i) => {
    if (t < s || t > e) return;
    const u = t - s;
    const vib = i === 3 ? 0.55 * Math.sin(TAU * 5.5 * u) * gte(u, 0.35) : 0;
    const ph = TAU * f * u + vib;
    const tone = Math.tanh(2.5 * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.3 * Math.sin(3 * ph)));
    sum += tone * env(t, s, e, 30, 10);
  });
  return 0.32 * sum;
}

function victory(t) {
  const notes = [[0.0, 0.1, 523.25], [0.1, 0.2, 659.25], [0.2, 0.3, 783.99]];
  let sum = 0;
  for (const [s, e, f] of notes) sum += Math.tanh(6 * Math.sin(TAU * f * (t - s))) * env(t, s, e, 200, 60);
  if (t >= 0.3) {
    sum += Math.tanh(6 * Math.sin(TAU * 1046.5 * (t - 0.3))) * Math.exp(-2.2 * (t - 0.3))
      * Math.max(0, Math.min(1, (1.25 - t) * 20));
  }
  return 0.2 * sum;
}

const TICKS = (() => {
  const times = [];
  let t = 0;
  let gap = 0.5;
  while (t < 2.45) {
    times.push(Math.round(t * 1000) / 1000);
    t += gap;
    gap = Math.max(0.07, gap * 0.8);
  }
  return times;
})();

function tick(t) {
  let sum = 0;
  for (const s of TICKS) {
    if (t < s) continue;
    const u = t - s;
    sum += Math.sin(TAU * 2400 * u) * Math.exp(-260 * u) + 0.5 * Math.sin(TAU * 1200 * u) * Math.exp(-200 * u);
  }
  return 0.6 * sum;
}

function heartbeat(t) {
  let sum = 0;
  for (const s of [0.0, 0.26, 0.85, 1.11]) {
    if (t < s) continue;
    const u = t - s;
    sum += (Math.sin(TAU * 58 * u) + 0.3 * Math.sin(TAU * 116 * u)) * Math.exp(-16 * u);
  }
  return 0.85 * sum;
}

function airhorn(t) {
  let saw = 0;
  for (const f of [452, 455.5, 459]) saw += 2 * (f * t - Math.floor(f * t + 0.5));
  let e = 0;
  for (const [s, end] of [[0.0, 0.3], [0.36, 0.52], [0.58, 1.45]]) e += env(t, s, end, 60, 25);
  return 0.5 * Math.tanh(1.6 * saw / 3 * e);
}

/**
 * name: {seconds, about, filters, make(random) -> (t) => sample}
 * make() is called once per sound so formulas with memory (filtered noise) start fresh.
 */
export const BUILTIN = {
  boom: {
    seconds: 1.4, filters: [["lowpass", 900]],
    about: "deep boom - the classic hit for a reveal, the steal, or a fail",
    make: (rand) => (t) => 0.85 * Math.tanh(2.4 * (Math.sin(TAU * chirp(t, 42, 137, 9)) * Math.exp(-3 * t)
      * Math.min(1, t * 300) + 0.5 * (2 * rand() - 1) * Math.exp(-70 * t))),
  },
  bass_drop: {
    seconds: 1.8, filters: [["lowpass", 400]],
    about: "long deep bass drop - right after a riser build-up",
    make: () => (t) => 0.9 * Math.tanh(2 * Math.sin(TAU * chirp(t, 32, 122, 2.6)) * Math.exp(-1.3 * t)
      * Math.min(1, t * 200)),
  },
  hit: {
    seconds: 0.4, filters: [["lowpass", 2500]],
    about: "short punchy hit - someone gets hit or slapped",
    make: (rand) => (t) => 0.8 * Math.tanh(2 * (Math.sin(TAU * chirp(t, 90, 250, 30)) * Math.exp(-11 * t)
      + 0.8 * (2 * rand() - 1) * Math.exp(-45 * t))),
  },
  whoosh: {
    seconds: 0.8, filters: [["highpass", 150]],
    about: "fast whoosh - zooms, speed-ups, transitions",
    make: (rand) => {
      let mem = 0;
      return (t) => {
        const shape = Math.sin(PI * t / 0.8);
        mem += (0.02 + 0.3 * shape * shape) * ((2 * rand() - 1) - mem);
        return mem * Math.pow(Math.abs(shape), 1.5) * 2.6;
      };
    },
  },
  riser: {
    seconds: 2.5, filters: [["highpass", 80]],
    about: "2.5 s rising tension - start it 2.5 s BEFORE the big moment",
    make: (rand) => {
      let mem = 0;
      return (t) => {
        const k = (t / 2.5) ** 2;
        mem += (0.01 + 0.4 * k) * ((2 * rand() - 1) - mem);
        return 0.8 * Math.tanh((0.5 * Math.sin(TAU * (180 * t + 37.333 * t * t * t)) + 1.4 * mem) * k * 1.4);
      };
    },
  },
  tick: {
    seconds: 2.6, filters: [["highpass", 400]],
    about: "ticking clock that speeds up - suspense before a steal",
    make: () => tick,
  },
  alarm: {
    seconds: 1.8, filters: [],
    about: "siren alarm - base alarm, getting caught, running away",
    make: () => (t) => 0.55 * Math.tanh(3 * Math.sin(TAU * 700 * t - 150 * Math.cos(4 * PI * t)))
      * Math.min(1, t * 50) * Math.min(1, (1.8 - t) * 8),
  },
  ding: {
    seconds: 1.4, filters: [],
    about: "bright ding - success, item collected",
    make: () => (t) => 0.5 * (Math.sin(TAU * 1318.5 * t) + 0.45 * Math.sin(TAU * 2637 * t) * Math.exp(-2 * t)
      + 0.25 * Math.sin(TAU * 3951.1 * t) * Math.exp(-4 * t)) * Math.exp(-3.2 * t) * Math.min(1, t * 400),
  },
  cash: {
    seconds: 1.0, filters: [["highpass", 300]],
    about: "cha-ching - money, W, getting rich",
    make: (rand) => (t) => 0.5 * (2 * rand() - 1) * Math.exp(-35 * t)
      + gte(t, 0.07) * 0.45 * Math.sin(TAU * 1568 * (t - 0.07)) * Math.exp(-6 * (t - 0.07))
      + gte(t, 0.15) * 0.5 * (Math.sin(TAU * 2093 * (t - 0.15)) + 0.3 * Math.sin(TAU * 4186 * (t - 0.15)))
      * Math.exp(-4 * (t - 0.15)),
  },
  pop: {
    seconds: 0.18, filters: [],
    about: "little pop - a sticker or caption appearing",
    make: () => (t) => 0.8 * Math.sin(TAU * chirp(t, 260, 900, 45)) * Math.exp(-28 * t) * Math.min(1, t * 800),
  },
  fail_horn: {
    seconds: 2.9, filters: [["lowpass", 3000]],
    about: "sad trombone 'wah wah wah' - fails (L)",
    make: () => failHorn,
  },
  victory: {
    seconds: 1.3, filters: [],
    about: "retro victory jingle - W, steal complete",
    make: () => victory,
  },
  heartbeat: {
    seconds: 1.6, filters: [["lowpass", 300]],
    about: "heartbeat - tense sneaking moments",
    make: () => heartbeat,
  },
  glitch: {
    seconds: 0.6, filters: [],
    about: "digital glitch - laggy or weird moments",
    make: () => (t) => 0.35 * Math.tanh(8 * Math.sin(TAU * (180 + 1400 * Math.abs(Math.sin(Math.floor(t * 22) * 12.9898))) * t))
      * (Math.sin(TAU * 9 * t) > -0.6 ? 1 : 0),
  },
  airhorn: {
    seconds: 1.5, filters: [["highpass", 300], ["lowpass", 5000]],
    about: "air horn blasts - hype moments",
    make: () => airhorn,
  },
};

export const BUILTIN_NAMES = Object.keys(BUILTIN);

/** Two-pole Butterworth low/high-pass (the same kind of filter ffmpeg's lowpass/highpass use). */
export function biquad(samples, type, freq, rate = SAMPLE_RATE) {
  const w0 = TAU * freq / rate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  let b0;
  let b1;
  let b2;
  if (type === "lowpass") {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
  } else {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const out = new Float32Array(samples.length);
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}

export function peakDb(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

const cache = new Map();

/** The samples of a built-in sound (mono, SAMPLE_RATE), peaking at PEAK_DB. */
export function synthesize(name, rate = SAMPLE_RATE) {
  const key = `${name}@${rate}`;
  if (cache.has(key)) return cache.get(key);
  const spec = BUILTIN[name];
  if (!spec) throw new Error(`No built-in sound called '${name}'.`);
  const n = Math.round(spec.seconds * rate);
  const fn = spec.make(rng(0x9e3779b9 ^ name.length * 7919));
  let samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = fn(i / rate);
    samples[i] = Number.isFinite(v) ? v : 0;
  }
  for (const [type, freq] of spec.filters) samples = biquad(samples, type, freq, rate);
  const gain = 10 ** ((PEAK_DB - peakDb(samples)) / 20);
  if (Number.isFinite(gain)) for (let i = 0; i < n; i++) samples[i] *= gain;
  cache.set(key, samples);
  return samples;
}

/** Seconds a sound lasts (built-in ones; others count as 2 s). */
export function soundLength(name, userSounds = null) {
  if (userSounds && userSounds[name] && userSounds[name].seconds) return userSounds[name].seconds;
  return BUILTIN[name] ? BUILTIN[name].seconds : 2.0;
}

/** Every sound the AI can use: {name: description}. The user's own sounds win on name clashes. */
export function catalog(userSoundNames = []) {
  const out = {};
  for (const [name, spec] of Object.entries(BUILTIN)) out[name] = spec.about;
  for (const name of userSoundNames) out[name] = "your own sound (from My Sounds)";
  return out;
}

/** A file name as a sound name the AI can say: "Vine Boom (1).mp3" -> "vine_boom_1". */
export function cleanName(stem) {
  return String(stem).toLowerCase().replace(/\.[a-z0-9]{1,5}$/, "").replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "sound";
}
