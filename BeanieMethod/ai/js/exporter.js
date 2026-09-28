/* Making the finished MP4 in the browser: every frame is decoded, drawn with the same compositor the
 * preview uses, and encoded with WebCodecs (H.264 + AAC when this PC can, like TikTok wants).
 */

import { MB, openInput } from "./media.js";
import { Scene, outputFps } from "./compositor.js";
import { Timeline } from "./engine/plan.js";
import { RATE, buildGameAudio, decodeAudio, mixAudio } from "./audio.js";

export class ExportError extends Error {}

const VIDEO_CODECS = ["avc", "hevc", "vp9", "av1"];
const AUDIO_CODECS = ["aac", "opus"];

/** Which codecs this PC can make at this size: {video, audio}. */
export async function pickCodecs(width, height) {
  const video = await MB.getFirstEncodableVideoCodec(VIDEO_CODECS, { width, height });
  const audio = await MB.getFirstEncodableAudioCodec(AUDIO_CODECS, { numberOfChannels: 2, sampleRate: RATE });
  return { video, audio };
}

/**
 * Export a project. Returns {blob, duration, width, height, fps, codecs, warnings}.
 * source: the clip Blob; overlays: a prepared OverlayCache; bank: SoundBank.
 */
export async function exportVideo({ source, info, plan, overlays, bank, onProgress = () => {}, signal = null }) {
  const fps = outputFps(info);
  const timeline = new Timeline(plan, info.duration, fps);
  if (timeline.duration < 0.2) throw new ExportError("The video would be empty. Try keeping a longer part of the clip.");
  await overlays.prepare(plan);
  const scene = new Scene(plan, info, timeline, { scale: 1, overlays });
  const [width, height] = scene.size;
  const warnings = timeline.moved.map((t) => `The freeze at ${t.toFixed(1)}s was in a cut-out part, so I moved it.`);
  const codecs = await pickCodecs(width, height);
  if (!codecs.video) throw new ExportError("This PC's Chrome can't make videos (no video encoder). Update Chrome and try again.");

  const checkStop = () => {
    if (signal && signal.aborted) throw new DOMException("Export stopped", "AbortError");
  };

  // Sound first (quick), so a problem shows up before the long part.
  onProgress(0.01, "Mixing the sound…");
  let audioBuffer = null;
  if (codecs.audio) {
    const segs = timeline.segments.filter((s) => s.kind === "clip");
    const from = segs.length ? Math.min(...segs.map((s) => s.src_start)) : 0;
    const to = segs.length ? Math.max(...segs.map((s) => s.src_end)) : 0;
    const decoded = info.has_audio ? await decodeAudio(source, Math.max(0, from - 0.05), to + 0.05) : null;
    checkStop();
    const game = buildGameAudio(decoded, timeline, RATE);
    audioBuffer = await mixAudio({ game, plan, timeline, bank, onWarning: (w) => warnings.push(w) });
  } else {
    warnings.push("This PC can't make video sound, so the video is silent.");
  }
  checkStop();

  const input = openInput(source);
  const track = await input.getPrimaryVideoTrack();
  const rotated = (track.rotation || 0) !== 0;
  const first = info.start || 0;
  const frames = Math.max(1, Math.round(timeline.duration * fps));
  const times = [];
  const bw = [];
  for (let i = 0; i < frames; i++) {
    const tOut = (i + 0.5) / fps;
    const seg = timeline.segments[timeline.segmentAt(tOut)];
    const src = seg.kind === "freeze" ? seg.src_at : timeline.toSource(tOut);
    times.push(Math.max(first, Math.min(src, info.duration - 0.001)));
    bw.push(seg.kind === "freeze" && seg.bw);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false });
  const upright = rotated ? new OffscreenCanvas(info.width, info.height) : null;
  const uprightCtx = upright ? upright.getContext("2d") : null;
  const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: "in-memory" }), target: new MB.BufferTarget() });
  const videoSource = new MB.CanvasSource(canvas, {
    codec: codecs.video, quality: MB.QUALITY_HIGH, keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, { frameRate: fps });
  let audioSource = null;
  if (audioBuffer) {
    audioSource = new MB.AudioBufferSource({ codec: codecs.audio, quality: MB.QUALITY_HIGH });
    output.addAudioTrack(audioSource);
  }
  await output.start();
  try {
    if (audioSource) {
      await audioSource.add(audioBuffer);
      audioSource.close();
    }
    const sink = new MB.VideoSampleSink(track);
    let i = 0;
    let lastGood = null;  // the last frame drawn, for any frame that can't be read
    for await (const sample of sink.samplesAtTimestamps(times)) {
      checkStop();
      const tOut = i / fps;
      if (sample) {
        let image;
        if (rotated) {
          sample.draw(uprightCtx, 0, 0, info.width, info.height);
          image = upright;
        } else {
          image = sample.toCanvasImageSource();
        }
        scene.draw(ctx, image, info.width, info.height, tOut + 0.5 / fps, bw[i]);
        if (lastGood) lastGood.close();
        lastGood = sample;
      } else if (lastGood) {
        scene.draw(ctx, rotated ? upright : lastGood.toCanvasImageSource(), info.width, info.height, tOut + 0.5 / fps, bw[i]);
      } else {
        scene.draw(ctx, null, info.width, info.height, tOut + 0.5 / fps, bw[i]);
      }
      await videoSource.add(tOut, 1 / fps);
      i += 1;
      if (i % 5 === 0) onProgress(0.03 + 0.95 * (i / frames), `Exporting… ${Math.round((100 * i) / frames)}%`);
    }
    if (lastGood) lastGood.close();
    videoSource.close();
    onProgress(0.99, "Finishing…");
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  }
  const blob = new Blob([output.target.buffer], { type: "video/mp4" });
  return { blob, duration: timeline.duration, width, height, fps, codecs, warnings };
}
