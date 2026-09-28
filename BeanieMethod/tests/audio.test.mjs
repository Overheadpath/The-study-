// Sound for the finished video: slow-mo without changing pitch, the limiter, and game audio layout.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildGameAudio, limit, timeStretch } from "../ai/js/audio.js";
import { Timeline, applyActions, newPlan } from "../ai/js/engine/plan.js";

const RATE = 48000;

function tone(freq, seconds, amp = 0.5) {
  const x = new Float32Array(Math.round(RATE * seconds));
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / RATE);
  return x;
}

function pitch(x) {
  let crossings = 0;
  for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) crossings += 1;
  return crossings / 2 / (x.length / RATE);
}

const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe("audio", () => {
  test("slow-mo and speed-ups keep the pitch and the loudness", () => {
    const x = tone(440, 1);
    for (const factor of [0.25, 0.5, 2, 4]) {
      const [y] = timeStretch([x], factor, RATE);
      assert.equal(y.length, Math.round(x.length / factor), `length at ${factor}x`);
      assert.ok(Math.abs(pitch(y) - 440) < 6, `pitch at ${factor}x: ${pitch(y)}`);
      assert.ok(Math.abs(peak(y) - 0.5) < 0.03, `loudness at ${factor}x: ${peak(y)}`);
    }
  });

  test("the limiter keeps peaks under the ceiling and leaves quiet parts alone", () => {
    const x = tone(100, 1, 1.6);
    for (let i = 0; i < x.length / 2; i++) x[i] *= 0.2;
    limit([x], 0.9, RATE);
    assert.ok(peak(x) <= 0.9 + 1e-6, `peak ${peak(x)}`);
    assert.ok(Math.abs(peak(x.subarray(0, RATE * 0.4)) - 0.32) < 0.01, "quiet part untouched");
  });

  test("game audio follows the timeline: cuts, slow-mo and silent freezes", () => {
    const src = tone(440, 13, 0.4);
    const decoded = { channels: [src, src], rate: RATE, start: 0 };
    const ctx = { duration: 13, markers: [], sounds: [], music: [] };
    const { plan } = applyActions(newPlan(), [
      { do: "remove", start: 0, end: 1.5 },
      { do: "speed", start: 5, end: 6, factor: 0.5 },
      { do: "freeze", at: 8, duration: 1 },
    ], ctx);
    const tl = new Timeline(plan, 13, 30);
    const [left] = buildGameAudio(decoded, tl, RATE);
    assert.equal(left.length, Math.round(tl.duration * RATE));
    const freeze = tl.segments.find((s) => s.kind === "freeze");
    const inFreeze = left.subarray(Math.round((freeze.out_start + 0.1) * RATE), Math.round((freeze.out_end - 0.1) * RATE));
    assert.equal(peak(inFreeze), 0, "silent during the freeze");
    const slow = tl.segments.find((s) => s.speed === 0.5);
    const inSlow = left.subarray(Math.round((slow.out_start + 0.1) * RATE), Math.round((slow.out_end - 0.1) * RATE));
    assert.ok(Math.abs(pitch(inSlow) - 440) < 8, `slow-mo keeps the pitch: ${pitch(inSlow)}`);
    assert.ok(peak(left) > 0.35, "the game is audible");
  });
});
