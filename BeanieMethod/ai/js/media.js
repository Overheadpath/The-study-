/* Reading clips in the browser (with Mediabunny + WebCodecs): what's in a file, making it playable,
 * looking at it (moments + timeline pictures), and grabbing frames for the AI to watch.
 */

import * as MB from "../vendor/mediabunny.min.mjs";
import { AudioAnalyzer, VideoAnalyzer, findMoments, lumaPlane } from "./engine/moments.js";

export { MB };

export const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|mkv|webm|avi|wmv|flv|ts|mts|3gp)$/i;
export const THUMB_COUNT = 16;
export const THUMB_WIDTH = 160;

export class MediaError extends Error {}

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

export function openInput(blob) {
  return new MB.Input({ source: new MB.BlobSource(blob), formats: MB.ALL_FORMATS });
}

const CODEC_NAMES = { avc: "H.264", hevc: "H.265/HEVC", vp8: "VP8", vp9: "VP9", av1: "AV1", aac: "AAC", opus: "Opus",
  mp3: "MP3", vorbis: "Vorbis", flac: "FLAC" };

/** What's in a video file: {duration, width, height, fps, has_audio, codec, audio_codec, container, rotation}. */
export async function probe(blob) {
  const input = openInput(blob);
  let format;
  try {
    format = await input.getFormat();
  } catch (e) {
    throw new MediaError("That doesn't look like a video file Chrome can read.");
  }
  const video = await input.getPrimaryVideoTrack();
  if (!video) throw new MediaError("That file has no video in it.");
  if (!(await video.canDecode())) {
    throw new MediaError(`Chrome can't play this video's format (${CODEC_NAMES[video.codec] || video.codec || "unknown"}). `
      + "Record as MP4 (H.264) and try again.");
  }
  const audio = await input.getPrimaryAudioTrack();
  const hasAudio = Boolean(audio) && (await audio.canDecode());
  const duration = await input.computeDuration();
  const start = await video.getFirstTimestamp();
  let fps = 30;
  try {
    const stats = await video.computePacketStats(150);
    if (stats.averagePacketRate > 1) fps = Math.round(stats.averagePacketRate * 100) / 100;
  } catch (e) { /* keep 30 */ }
  if (!(duration > 0.5)) throw new MediaError("That video is too short.");
  return {
    duration: Math.round(duration * 1000) / 1000,
    start: Math.max(0, start || 0),
    width: video.displayWidth,
    height: video.displayHeight,
    fps,
    has_audio: hasAudio,
    codec: video.codec,
    audio_codec: audio ? audio.codec : null,
    container: format.name,
    mime: format.mimeType,
    rotation: video.rotation || 0,
  };
}

/** True if a <video> element can play this file (checked by trying). */
export function canPlay(blob, timeout = 8000) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    const url = URL.createObjectURL(blob);
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeout);
    v.onloadeddata = () => finish(v.videoWidth > 0);
    v.onerror = () => finish(false);
    v.preload = "auto";
    v.src = url;
  });
}

/** Copy a clip into an MP4 (no quality lost when the codecs allow it) so the player can use it. */
export async function toMp4(blob, onProgress = null, signal = null) {
  const input = openInput(blob);
  const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: "in-memory" }), target: new MB.BufferTarget() });
  const conversion = await MB.Conversion.init({ input, output });
  if (!conversion.isValid) throw new MediaError("I couldn't turn this video into an MP4.");
  if (onProgress) conversion.onProgress = (p) => onProgress(p);
  const stop = () => conversion.cancel();
  if (signal) signal.addEventListener("abort", stop, { once: true });
  try {
    await conversion.execute();
  } finally {
    if (signal) signal.removeEventListener("abort", stop);
  }
  return new Blob([output.target.buffer], { type: "video/mp4" });
}

async function canvasBlob(canvas, type = "image/jpeg", quality = 0.82) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Look at a clip: moments (loading screens, menus, loud sounds, big changes) and the timeline pictures.
 * Returns {analysis, thumbs (a JPEG Blob strip of THUMB_COUNT pictures)}.
 */
export async function analyzeClip(blob, info, { onProgress = null, signal = null } = {}) {
  const input = openInput(blob);
  const video = await input.getPrimaryVideoTrack();
  const audio = info.has_audio ? await input.getPrimaryAudioTrack() : null;
  const duration = info.duration;
  const aw = THUMB_WIDTH;
  const ah = even((THUMB_WIDTH * info.height) / info.width);
  const step = 0.1;
  const times = [];
  for (let t = info.start || 0; t < duration - 0.02; t += step) times.push(Math.round(t * 1000) / 1000);

  const strip = new OffscreenCanvas(aw * THUMB_COUNT, ah);
  const stripCtx = strip.getContext("2d");
  const reader = new OffscreenCanvas(aw, ah);
  const readerCtx = reader.getContext("2d", { willReadFrequently: true });
  const thumbTimes = Array.from({ length: THUMB_COUNT }, (_, i) => ((i + 0.5) * duration) / THUMB_COUNT);
  let nextThumb = 0;
  let videoDone = 0;
  let audioDone = info.has_audio ? 0 : 1;
  const report = () => onProgress && onProgress(Math.min(0.99, 0.75 * videoDone + 0.25 * audioDone));

  const va = new VideoAnalyzer(step);
  const videoJob = (async () => {
    const sink = new MB.CanvasSink(video, { width: aw, height: ah, fit: "fill", poolSize: 2 });
    let i = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(times)) {
      if (signal && signal.aborted) throw new DOMException("Stopped", "AbortError");
      const t = times[i++];
      if (!wrapped) continue;
      readerCtx.drawImage(wrapped.canvas, 0, 0, aw, ah);
      const pixels = readerCtx.getImageData(0, 0, aw, ah).data;
      va.push(t, lumaPlane(pixels, aw * ah));
      while (nextThumb < THUMB_COUNT && (thumbTimes[nextThumb] <= t + step / 2 || i === times.length)) {
        stripCtx.drawImage(reader, nextThumb * aw, 0);
        nextThumb += 1;
      }
      videoDone = i / times.length;
      if (i % 10 === 0) report();
    }
    while (nextThumb < THUMB_COUNT) {
      stripCtx.drawImage(reader, nextThumb * aw, 0);
      nextThumb += 1;
    }
    videoDone = 1;
  })();

  let levels = [];
  const audioJob = (async () => {
    if (!audio) return;
    const sink = new MB.AudioBufferSink(audio);
    let analyzer = null;
    for await (const { buffer, timestamp } of sink.buffers()) {
      if (signal && signal.aborted) throw new DOMException("Stopped", "AbortError");
      if (!analyzer) analyzer = new AudioAnalyzer(buffer.sampleRate);
      const channels = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      analyzer.push(channels);
      audioDone = Math.min(1, (timestamp + buffer.duration) / duration);
    }
    if (analyzer) levels = analyzer.finish();
    audioDone = 1;
  })();

  await Promise.all([videoJob, audioJob]);
  const v = va.finish(duration);
  const found = findMoments(duration, v.scene, v.black, v.freeze, v.luma, levels);
  if (onProgress) onProgress(1);
  return {
    analysis: { ...found, thumbs: { count: THUMB_COUNT, width: aw, height: ah } },
    thumbs: await canvasBlob(strip),
  };
}

/** A few JPEG frames for the AI to watch: [{t, jpeg}]. */
export async function grabFrames(blob, times, width = 512) {
  const input = openInput(blob);
  const video = await input.getPrimaryVideoTrack();
  const sink = new MB.CanvasSink(video, { width, poolSize: 1 });
  const out = [];
  let i = 0;
  for await (const wrapped of sink.canvasesAtTimestamps(times)) {
    const t = times[i++];
    if (!wrapped) continue;
    const copy = new OffscreenCanvas(wrapped.canvas.width, wrapped.canvas.height);
    copy.getContext("2d").drawImage(wrapped.canvas, 0, 0);
    out.push({ t, jpeg: await canvasBlob(copy, "image/jpeg", 0.8) });
  }
  return out;
}

/** One small picture of a clip (for the recordings list). */
export async function posterOf(blob, width = 320) {
  const input = openInput(blob);
  const video = await input.getPrimaryVideoTrack();
  if (!video) return null;
  const duration = await input.computeDuration();
  const sink = new MB.CanvasSink(video, { width, poolSize: 1 });
  const wrapped = await sink.getCanvas(Math.min(2, duration * 0.3));
  if (!wrapped) return null;
  const copy = new OffscreenCanvas(wrapped.canvas.width, wrapped.canvas.height);
  copy.getContext("2d").drawImage(wrapped.canvas, 0, 0);
  return canvasBlob(copy, "image/jpeg", 0.75);
}
