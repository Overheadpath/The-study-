/* The live preview: plays the edit straight from the original clip, no rendering needed.
 *
 * A hidden <video> plays the clip; each frame is drawn through the same compositor as the export.
 * Cuts are seeks, slow-mo is playbackRate (pitch stays the same, like the export), freezes hold a
 * frame, and sound effects and music play through Web Audio at the right moments.
 */

import { Scene, canvasSize } from "./compositor.js";
import { soundEvents } from "./audio.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class EditedPlayer {
  constructor({ canvas, video, bank, overlays, onTime = () => {}, onState = () => {} }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.video = video;
    this.bank = bank;
    this.overlays = overlays;
    this.onTime = onTime;
    this.onState = onState;
    this.t = 0;
    this.playing = false;
    this.seg = 0;
    this.freezeStart = 0;
    this.audio = null;
    this.active = new Set();
    this.music = null;
    this.scheduled = new Set();
    this.events = [];
    this.timeline = null;
    this.scene = null;
    this.dirty = true;
    this.alive = true;
    const redraw = () => { this.dirty = true; };
    for (const ev of ["seeked", "loadeddata", "canplay"]) video.addEventListener(ev, redraw);
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  get duration() {
    return this.timeline ? this.timeline.duration : 0;
  }

  /** Show a (new) edit. Keeps the position unless `restart`. */
  setEdit(info, plan, timeline, { restart = false } = {}) {
    this.info = info;
    this.plan = plan;
    this.timeline = timeline;
    const full = canvasSize(plan, info, 1);
    const scale = Math.min(1, 960 / Math.max(...full));
    this.scene = new Scene(plan, info, timeline, { scale, overlays: this.overlays });
    const [w, h] = this.scene.size;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.events = soundEvents(plan, timeline, this.bank);
    if (this.gameGain) this.gameGain.gain.value = plan.game_volume ?? 1;
    const t = restart ? 0 : clamp(this.t, 0, Math.max(0, timeline.duration - 0.001));
    this.seek(t);
  }

  ensureAudio() {
    if (!this.audio) {
      this.audio = new AudioContext({ latencyHint: "interactive" });
      try {
        const src = this.audio.createMediaElementSource(this.video);
        this.gameGain = this.audio.createGain();
        this.gameGain.gain.value = this.plan ? this.plan.game_volume ?? 1 : 1;
        src.connect(this.gameGain).connect(this.audio.destination);
      } catch (e) {
        this.gameGain = null;  // the video plays its own sound
      }
    }
    if (this.audio.state === "suspended") this.audio.resume().catch(() => {});
  }

  play() {
    if (!this.timeline || this.playing) return;
    if (this.t >= this.duration - 0.02) this.t = 0;
    this.ensureAudio();
    this.playing = true;
    this.enter(this.timeline.segmentAt(this.t), this.t);
    this.startMusic();
    this.onState(true);
  }

  pause() {
    const was = this.playing;
    this.playing = false;
    this.video.pause();
    this.stopSounds();
    if (was) this.onState(false);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Jump to finished-video time t. */
  seek(t) {
    if (!this.timeline) return;
    this.t = clamp(t, 0, this.duration);
    this.stopSounds();
    this.scheduled = new Set(this.events.filter((ev) => ev.when < this.t - 0.03));
    this.enter(this.timeline.segmentAt(this.t), this.t);
    if (this.playing) this.startMusic();
    this.dirty = true;
    this.onTime(this.t);
  }

  /** Start segment i at finished-video time t. */
  enter(i, t) {
    const segs = this.timeline.segments;
    this.seg = i;
    if (i >= segs.length) {
      this.finish();
      return;
    }
    const s = segs[i];
    const offset = Math.max(0, t - s.out_start);
    if (s.kind === "clip") {
      const target = s.src_start + offset * s.speed;
      this.video.playbackRate = s.speed;
      this.seekVideo(target);
      if (this.playing) this.video.play().catch(() => {});
    } else {
      this.video.pause();
      this.seekVideo(s.src_at);
      this.freezeStart = performance.now() - offset * 1000;
    }
  }

  seekVideo(target) {
    if (Math.abs(this.video.currentTime - target) > 0.03 || this.video.ended) this.video.currentTime = target;
  }

  finish() {
    this.t = this.duration;
    this.pause();
    this.onTime(this.t);
  }

  advance(now) {
    const segs = this.timeline.segments;
    const s = segs[this.seg];
    if (!s) {
      this.finish();
      return;
    }
    if (s.kind === "clip") {
      if (this.video.seeking) return;  // hold the clock while the video jumps
      const vt = this.video.currentTime;
      this.t = Math.min(s.out_end, s.out_start + Math.max(0, vt - s.src_start) / s.speed);
      if (vt >= s.src_end - 0.015 || this.video.ended) this.enter(this.seg + 1, s.out_end);
    } else {
      this.t = Math.min(s.out_end, s.out_start + (now - this.freezeStart) / 1000);
      if (this.t >= s.out_end - 1e-3) this.enter(this.seg + 1, s.out_end);
    }
  }

  scheduleSounds() {
    if (!this.audio || this.video.seeking) return;
    for (const ev of this.events) {
      if (this.scheduled.has(ev)) continue;
      if (ev.when < this.t - 0.1) {
        this.scheduled.add(ev);
        continue;
      }
      if (ev.when > this.t + 0.12) continue;
      this.scheduled.add(ev);
      const wait = Math.max(0, ev.when - this.t);
      this.bank.get(ev.name).then((buf) => {
        if (!buf || !this.playing || !this.scheduled.has(ev)) return;
        const src = this.audio.createBufferSource();
        src.buffer = buf;
        const gain = this.audio.createGain();
        gain.gain.value = ev.volume;
        src.connect(gain).connect(this.audio.destination);
        src.onended = () => this.active.delete(src);
        this.active.add(src);
        src.start(this.audio.currentTime + wait);
      });
    }
  }

  async startMusic() {
    this.stopMusic();
    const music = this.plan && this.plan.music;
    if (!music || !this.audio) return;
    const buf = await this.bank.get(music.name);
    if (!buf || !this.playing) return;
    const src = this.audio.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.audio.createGain();
    const vol = music.volume ?? 0.35;
    const now = this.audio.currentTime;
    const left = this.duration - this.t;
    gain.gain.setValueAtTime(vol, now);
    if (left > 1.5) gain.gain.setValueAtTime(vol, now + left - 1.5);
    gain.gain.linearRampToValueAtTime(0, now + Math.max(0.05, left));
    src.connect(gain).connect(this.audio.destination);
    src.start(now, this.t % buf.duration);
    this.music = src;
  }

  stopMusic() {
    if (this.music) {
      try { this.music.stop(); } catch (e) { /* already stopped */ }
      this.music = null;
    }
  }

  stopSounds() {
    for (const src of this.active) {
      try { src.stop(); } catch (e) { /* already stopped */ }
    }
    this.active.clear();
    this.stopMusic();
  }

  /** Clip time shown right now. */
  clipTime() {
    return this.timeline ? this.timeline.toSource(this.t) : 0;
  }

  draw() {
    if (!this.scene) return;
    const v = this.video;
    const seg = this.timeline.segments[this.seg];
    const bw = Boolean(seg && seg.kind === "freeze" && seg.bw);
    if (v.readyState >= 2 && v.videoWidth) this.scene.draw(this.ctx, v, v.videoWidth, v.videoHeight, this.t, bw);
    else this.scene.draw(this.ctx, null, this.info.width, this.info.height, this.t, bw);
  }

  tick(now) {
    if (!this.alive) return;
    requestAnimationFrame(this.tick);
    if (!this.timeline) return;
    if (this.playing) {
      this.advance(now);
      this.scheduleSounds();
      this.onTime(this.t);
    }
    if (this.playing || this.dirty) {
      this.dirty = false;
      this.draw();
    }
  }

  destroy() {
    this.alive = false;
    this.pause();
    if (this.audio) this.audio.close().catch(() => {});
  }
}
