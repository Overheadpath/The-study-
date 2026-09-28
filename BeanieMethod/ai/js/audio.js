/* Sound for the finished video: the game audio (cut and stretched like the picture),
 * sound effects, music, and a limiter so nothing clips.
 */

import { MB, openInput } from "./media.js";
import { BUILTIN, soundLength, synthesize } from "./engine/sfx.js";

export const RATE = 48000;

/**
 * Change speed without changing pitch (WSOLA), like ffmpeg's atempo.
 * channels: Float32Array per channel. factor: 0.5 = half speed (twice as long).
 */
export function timeStretch(channels, factor, rate = RATE) {
  const inLen = channels[0].length;
  if (Math.abs(factor - 1) < 1e-3 || inLen === 0) return channels.map((c) => c.slice());
  const N = 2 * Math.round(rate * 0.02);          // 40 ms frames
  const hs = N / 2;                                // output hop
  const ha = hs * factor;                          // input hop
  const tol = Math.round(rate * 0.008);            // look ±8 ms for the best match
  const outLen = Math.round(inLen / factor);
  const out = channels.map(() => new Float32Array(outLen + N));
  const norm = new Float32Array(outLen + N);
  const win = new Float32Array(N);
  for (let j = 0; j < N; j++) win[j] = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / N);
  const mono = new Float32Array(inLen);
  for (const ch of channels) for (let i = 0; i < inLen; i++) mono[i] += ch[i] / channels.length;
  let prev = 0;
  for (let k = 0; k * hs < outLen; k++) {
    const outPos = k * hs;
    const nominal = Math.round(k * ha);
    let best = Math.min(Math.max(0, nominal), Math.max(0, inLen - 1));
    if (k > 0) {
      const natural = prev + hs;
      let bestScore = -Infinity;
      for (let d = -tol; d <= tol; d += 2) {
        const p = nominal + d;
        if (p < 0 || p + hs >= inLen || natural + hs >= inLen) continue;
        let s = 0;
        for (let j = 0; j < hs; j += 3) s += mono[p + j] * mono[natural + j];
        if (s > bestScore) {
          bestScore = s;
          best = p;
        }
      }
    }
    for (let c = 0; c < channels.length; c++) {
      const src = channels[c];
      const dst = out[c];
      for (let j = 0; j < N; j++) {
        const idx = best + j;
        if (idx < inLen) dst[outPos + j] += src[idx] * win[j];
      }
    }
    for (let j = 0; j < N; j++) norm[outPos + j] += win[j];
    prev = best;
  }
  return out.map((ch) => {
    const res = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) res[i] = norm[i] > 0.05 ? ch[i] / norm[i] : ch[i];
    return res;
  });
}

/** Keeps peaks under `ceiling` (like ffmpeg's alimiter): gain drops just before a peak, then recovers. */
export function limit(channels, ceiling = 0.9, rate = RATE) {
  const n = channels[0].length;
  const look = Math.max(1, Math.round(rate * 0.005));
  const release = Math.exp(-1 / (rate * 0.08));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let peak = 0;
    for (const ch of channels) peak = Math.max(peak, Math.abs(ch[i]));
    need[i] = peak > ceiling ? ceiling / peak : 1;
  }
  // smallest gain needed in the next `look` samples (sliding minimum)
  const ahead = new Float32Array(n);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && need[q[tail - 1]] >= need[i]) tail -= 1;
    q[tail++] = i;
    while (q[head] > i + look) head += 1;
    ahead[i] = need[q[head]];
  }
  let g = 1;
  for (let i = 0; i < n; i++) {
    const target = ahead[i];
    g = target < g ? target : target + (g - target) * release;
    if (g < 0.9999) for (const ch of channels) ch[i] *= g;
  }
  return channels;
}

/** Decode a clip's sound between two times: {channels: [L, R], rate, start}. */
export async function decodeAudio(blob, from = 0, to = Infinity) {
  const input = openInput(blob);
  const track = await input.getPrimaryAudioTrack();
  if (!track || !(await track.canDecode())) return null;
  const sink = new MB.AudioBufferSink(track);
  const parts = [];
  let rate = 0;
  let first = null;
  for await (const { buffer, timestamp } of sink.buffers(Math.max(0, from), Number.isFinite(to) ? to : undefined)) {
    rate = buffer.sampleRate;
    if (first === null) first = timestamp;
    const l = buffer.getChannelData(0);
    const r = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : l;
    parts.push({ timestamp, l: l.slice(), r: r.slice() });
  }
  if (!parts.length) return null;
  const last = parts[parts.length - 1];
  const len = Math.round((last.timestamp - first) * rate) + last.l.length;
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  for (const p of parts) {
    const at = Math.max(0, Math.round((p.timestamp - first) * rate));
    L.set(p.l.subarray(0, Math.max(0, Math.min(p.l.length, len - at))), at);
    R.set(p.r.subarray(0, Math.max(0, Math.min(p.r.length, len - at))), at);
  }
  if (rate === RATE) return { channels: [L, R], rate, start: first };
  // resample to 48 kHz
  const buf = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: rate });
  buf.copyToChannel(L, 0);
  buf.copyToChannel(R, 1);
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.round((len * RATE) / rate)), RATE);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return { channels: [out.getChannelData(0), out.getChannelData(1)], rate: RATE, start: first };
}

/** The game sound laid out like the finished video: cut, slowed/sped up, silent during freezes. */
export function buildGameAudio(decoded, timeline, rate = RATE) {
  const len = Math.max(1, Math.round(timeline.duration * rate));
  const out = [new Float32Array(len), new Float32Array(len)];
  if (!decoded) return out;
  const fade = Math.round(rate * 0.004);
  for (const seg of timeline.segments) {
    if (seg.kind !== "clip") continue;
    const a = Math.max(0, Math.round((seg.src_start - decoded.start) * rate));
    const b = Math.min(decoded.channels[0].length, Math.round((seg.src_end - decoded.start) * rate));
    if (b - a < 2) continue;
    let piece = decoded.channels.map((ch) => ch.subarray(a, b));
    piece = seg.speed !== 1 ? timeStretch(piece, seg.speed, rate) : piece.map((ch) => ch.slice());
    const at = Math.round(seg.out_start * rate);
    const n = Math.min(piece[0].length, len - at);
    for (let c = 0; c < 2; c++) {
      const src = piece[c];
      const dst = out[c];
      for (let i = 0; i < n; i++) {
        const edge = Math.min(1, i / fade, (n - 1 - i) / fade);  // tiny fades so cuts don't click
        dst[at + i] += src[i] * edge;
      }
    }
  }
  return out;
}

/** Built-in and user sounds as AudioBuffers (they work in any AudioContext). */
export class SoundBank {
  constructor() {
    this.buffers = new Map();
    this.user = new Map();     // name -> {blob, kind, seconds}
  }

  setUser(records) {
    this.user = new Map(records.map((r) => [r.name, r]));
    for (const key of [...this.buffers.keys()]) if (!BUILTIN[key]) this.buffers.delete(key);
  }

  userNames(kind) {
    return [...this.user.values()].filter((r) => r.kind === kind).map((r) => r.name).sort();
  }

  length(name) {
    const mine = this.user.get(name);
    if (mine && mine.kind === "sound") return mine.seconds || 2;
    return soundLength(name);
  }

  async get(name) {
    if (this.buffers.has(name)) return this.buffers.get(name);
    let buffer = null;
    const mine = this.user.get(name);
    if (mine) {
      const ctx = new OfflineAudioContext(2, 1, RATE);
      buffer = await ctx.decodeAudioData(await mine.blob.arrayBuffer());
    } else if (BUILTIN[name]) {
      const samples = synthesize(name, RATE);
      buffer = new AudioBuffer({ length: samples.length, numberOfChannels: 1, sampleRate: RATE });
      buffer.copyToChannel(samples, 0);
    }
    if (buffer) this.buffers.set(name, buffer);
    return buffer;
  }
}

/** When each sound effect starts in the finished video: [{when, name, volume}]. */
export function soundEvents(plan, timeline, bank) {
  const total = timeline.duration;
  const out = [];
  for (const snd of plan.sound || []) {
    const when = snd.at === "end" ? Math.max(0, total - Math.min(bank.length(snd.name), 1.5)) : timeline.place(snd.at, 0)[0];
    if (when >= total - 0.05) continue;
    out.push({ when, name: snd.name, volume: snd.volume ?? 1 });
  }
  return out;
}

/** The finished video's sound: game audio + effects + music, limited. Returns an AudioBuffer. */
export async function mixAudio({ game, plan, timeline, bank, onWarning = () => {} }) {
  const duration = timeline.duration;
  const len = Math.max(1, Math.round(duration * RATE));
  const ctx = new OfflineAudioContext(2, len, RATE);
  const gameBuf = ctx.createBuffer(2, len, RATE);
  gameBuf.copyToChannel(game[0].subarray(0, len), 0);
  gameBuf.copyToChannel(game[1].subarray(0, len), 1);
  const gameSrc = ctx.createBufferSource();
  gameSrc.buffer = gameBuf;
  const gameGain = ctx.createGain();
  gameGain.gain.value = plan.game_volume ?? 1;
  gameSrc.connect(gameGain).connect(ctx.destination);
  gameSrc.start(0);
  for (const ev of soundEvents(plan, timeline, bank)) {
    const buf = await bank.get(ev.name);
    if (!buf) {
      onWarning(`Skipped the sound '${ev.name}' (I can't find it any more).`);
      continue;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = ev.volume;
    src.connect(gain).connect(ctx.destination);
    src.start(ev.when);
  }
  if (plan.music) {
    const buf = await bank.get(plan.music.name);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      const vol = plan.music.volume ?? 0.35;
      gain.gain.setValueAtTime(vol, 0);
      gain.gain.setValueAtTime(vol, Math.max(0, duration - 1.5));
      gain.gain.linearRampToValueAtTime(0, duration);
      src.connect(gain).connect(ctx.destination);
      src.start(0);
    } else {
      onWarning(`Skipped the music '${plan.music.name}' (I can't find it any more).`);
    }
  }
  const out = await ctx.startRendering();
  limit([out.getChannelData(0), out.getChannelData(1)], 0.9, RATE);
  return out;
}
