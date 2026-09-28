// The edit engine: plan actions, timeline, instant commands and skills.
// Run with: node --test BeanieMethod/tests/
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import * as P from "../ai/js/engine/plan.js";
import * as C from "../ai/js/engine/commands.js";
import * as K from "../ai/js/engine/skills.js";
import { BUILTIN_NAMES } from "../ai/js/engine/sfx.js";

const close = (a, b, places = 7) => assert.ok(Math.abs(a - b) < 0.5 * 10 ** -places, `${a} != ${b}`);

// ------------------------------------------------------------------ plan
const PLAN_SOUNDS = ["boom", "whoosh", "vine_boom", "ding"];
const pctx = (extra = {}) => ({ duration: 13.0, markers: [], sounds: PLAN_SOUNDS, music: [], ...extra });
const apply = (actions, plan = null, extra = {}) => P.applyActions(plan || P.newPlan(), actions, pctx(extra));

describe("parseTime", () => {
  test("formats", () => {
    const c = pctx({ duration: 100, markers: [{ t: 42.0, label: "steal" }], highlight: 7.5 });
    assert.equal(P.parseTime(12, c), 12);
    assert.equal(P.parseTime("12.5s", c), 12.5);
    assert.equal(P.parseTime("0:12", c), 12);
    assert.equal(P.parseTime("1:02.5", c), 62.5);
    assert.equal(P.parseTime("end", c), "end");
    assert.equal(P.parseTime("start", c), "start");
    assert.equal(P.parseTime("the steal", c), 42);
    assert.equal(P.parseTime(500, c), 100);
    assert.equal(P.parseTime("banana", c), null);
  });
  test("highlight used when there are no markers", () => {
    assert.equal(P.parseTime("best moment", pctx({ highlight: 6.0 })), 6);
  });
  test("an empty marker label doesn't match everything", () => {
    assert.equal(P.parseTime("banana", pctx({ markers: [{ t: 3.0, label: "" }] })), null);
  });
});

describe("actions", () => {
  test("keep and whole clip", () => {
    let { plan } = apply([{ do: "keep", start: 2, end: 10 }]);
    assert.deepEqual(plan.keep, { start: 2, end: 10 });
    ({ plan } = apply([{ do: "keep", start: 0, end: "end" }], plan));
    assert.equal(plan.keep, null);
  });
  test("remove merges overlaps", () => {
    const { plan } = apply([{ do: "remove", start: 3, end: 5 }, { do: "remove", start: 4, end: 7 }]);
    assert.deepEqual(plan.remove.map((i) => [i.start, i.end]), [[3, 7]]);
  });
  test("speed ranges replace overlaps", () => {
    const { plan } = apply([{ do: "speed", start: 5, end: 7, factor: 0.5 }, { do: "speed", start: 6, end: 8, factor: 2 }]);
    assert.deepEqual(plan.speed.map((i) => [i.start, i.end, i.factor]), [[5, 6, 0.5], [6, 8, 2]]);
  });
  test("values are clamped", () => {
    const { plan } = apply([{ do: "zoom", at: 3, amount: 50, x: -2, duration: 99 }]);
    const z = plan.zoom[0];
    assert.deepEqual([z.amount, z.x, z.duration], [3, 0, 10]);
  });
  test("bad actions warn instead of crashing", () => {
    const { plan, result } = apply([{ do: "fly" }, { do: "zoom", at: "banana" }, "nonsense",
      { do: "text" }, { do: "sound", name: "airhorn", at: 2 }]);
    assert.deepEqual(plan.zoom, []);
    assert.ok(result.warnings.length >= 4, result.warnings.join(" | "));
  });
  test("start and end times", () => {
    const { plan, result } = apply([{ do: "text", text: "EZ", at: "start" }, { do: "sound", name: "ding", at: "end" },
      { do: "freeze", at: "end" }, { do: "sticker", emoji: "💀" }]);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual([plan.text[0].at, plan.sound[0].at, plan.freeze[0].at, plan.sticker[0].at],
      ["start", "end", "end", "end"]);
    assert.ok(P.steps(plan).every((s) => typeof s.text === "string"));
  });
  test("sound names match loosely", () => {
    const { plan } = apply([{ do: "sound", name: "Vine Boom", at: 2 }]);
    assert.equal(plan.sound[0].name, "vine_boom");
  });
  test("limits", () => {
    const { plan, result } = apply(Array.from({ length: 13 }, (_, i) => ({ do: "zoom", at: i })));
    assert.equal(plan.zoom.length, 12);
    assert.ok(result.warnings.length);
  });
  test("format aliases", () => {
    const { plan } = apply([{ do: "format", format: "tiktok", fit: "zoom" }]);
    assert.deepEqual([plan.format, plan.fit], ["vertical", "crop"]);
  });
  test("delete", () => {
    let { plan } = apply([{ do: "sticker", emoji: "💀", at: 2 }, { do: "sticker", emoji: "🔥", at: 9 }, { do: "zoom", at: 4 }]);
    ({ plan } = apply([{ do: "delete", what: "emoji", at: 8.5 }], plan));
    assert.deepEqual(plan.sticker.map((s) => s.emoji), ["💀"]);
    ({ plan } = apply([{ do: "delete", id: plan.zoom[0].id }], plan));
    assert.deepEqual(plan.zoom, []);
    ({ plan } = apply([{ do: "delete", what: "stickers", index: "last" }], plan));
    assert.deepEqual(plan.sticker, []);
  });
  test("clear keeps the format", () => {
    const { plan } = apply([{ do: "format", format: "square" }, { do: "zoom", at: 1 }, { do: "clear" }]);
    assert.equal(plan.format, "square");
    assert.deepEqual(plan.zoom, []);
  });
  test("overlays dedupe", () => {
    const { plan } = apply([{ do: "sticker", emoji: "💀", at: 2 }, { do: "sticker", emoji: "💀", at: 5 },
      { do: "text", text: "EZ", at: 1 }]);
    assert.equal(P.overlays(plan).length, 2);
  });
  test("plans compare by content", () => {
    const { plan } = apply([{ do: "zoom", at: 3 }]);
    assert.ok(P.deepEqual(plan, JSON.parse(JSON.stringify(plan))));
    assert.ok(!P.deepEqual(plan, P.newPlan()));
  });
});

describe("timeline", () => {
  const build = () => {
    const { plan, result } = apply([
      { do: "keep", start: 1.5, end: 13 },
      { do: "remove", start: 8, end: 10.5 },
      { do: "speed", start: 5.5, end: 6.5, factor: 0.5 },
      { do: "freeze", at: 6.0, duration: 1.5 },
    ]);
    assert.deepEqual(result.warnings, []);
    return new P.Timeline(plan, 13.0);
  };
  test("duration", () => close(build().duration, 11.5, 3));
  test("mapping", () => {
    const tl = build();
    close(tl.toOutput(1.5), 0);
    close(tl.toOutput(5.5), 4);
    close(tl.toOutput(6.0), 5);    // the freeze starts here
    close(tl.toOutput(6.5), 7.5);  // after 1.5 s freeze + 0.5 s slow-mo
    close(tl.toOutput(9.0), 9.0);  // cut out: moves to 10.5
    assert.ok(tl.isCut(9.0));
    close(tl.toSource(10.0), 11.5);
    close(tl.toSource(5.7), 6.0);  // inside the freeze
    assert.equal(tl.segments[tl.segmentAt(5.7)].kind, "freeze");
    assert.equal(tl.segmentAt(99), tl.segments.length - 1);
  });
  test("a freeze right after a cut starts the freeze", () => {
    const { plan } = apply([{ do: "keep", start: 3, end: 13 }, { do: "freeze", at: 3, duration: 1 }]);
    const tl = new P.Timeline(plan, 13.0);
    assert.equal(tl.segments[0].kind, "freeze");
    close(tl.toOutput(3.0), 0);
    close(tl.duration, 11);
  });
  test("freeze at the end", () => {
    const { plan } = apply([{ do: "freeze", at: "end", duration: 2 }]);
    const tl = new P.Timeline(plan, 13.0, 30);
    assert.equal(tl.segments.at(-1).kind, "freeze");
    close(tl.segments.at(-1).src_at, 13.0 - 1 / 30, 4);
    close(tl.duration, 15);
    assert.deepEqual(tl.place("end", 2), [13, 15]);
  });
  test("a freeze inside a cut moves", () => {
    const { plan } = apply([{ do: "remove", start: 4, end: 6 }, { do: "freeze", at: 5, duration: 1 }]);
    const tl = new P.Timeline(plan, 13.0);
    assert.deepEqual(tl.moved, [5]);
    assert.deepEqual(tl.segments.map((s) => s.kind), ["clip", "freeze", "clip"]);
    close(tl.segments[1].src_at, 6);
  });
});

// ------------------------------------------------------------------ commands
const SOUNDS = [...BUILTIN_NAMES, "vine_boom_2"];
const cctx = (extra = {}) => ({ duration: 30.0, markers: [], sounds: SOUNDS, highlight: null, ...extra });
const parse = (text, extra = {}) => C.parse(text, cctx(extra));
const check = (text, expected, confident = true, extra = {}) => {
  const got = parse(text, extra);
  assert.deepEqual(got.actions, expected, `${text} -> ${JSON.stringify(got.actions)}`);
  assert.equal(got.confident, confident, `${text} confidence`);
};

describe("instant commands", () => {
  test("format", () => {
    check("make it vertical", [{ do: "format", format: "vertical", fit: "blur" }]);
    check("tiktok size but crop it", [{ do: "format", format: "vertical", fit: "crop" }]);
    check("square please", [{ do: "format", format: "square" }]);
    check("black bars", [{ do: "format", fit: "bars" }]);
  });
  test("ranges", () => {
    check("trim from 3 to 12", [{ do: "keep", start: 3, end: 12 }]);
    check("keep 0:05-0:20", [{ do: "keep", start: 5, end: 20 }]);
    check("cut out 5 to 7", [{ do: "remove", start: 5, end: 7 }]);
    check("remove between 5 and 7 seconds", [{ do: "remove", start: 5, end: 7 }]);
    check("cut the first 3 seconds", [{ do: "keep", start: 3, end: "end" }]);
    check("cut the last 2 seconds", [{ do: "keep", start: "start", end: 28 }]);
    check("start it at 4", [{ do: "keep", start: 4, end: "end" }]);
  });
  test("effects", () => {
    check("slow mo at 6", [{ do: "speed", start: 5.4, end: 6.6, factor: 0.5 }]);
    check("slow motion from 5 to 7 at 0.25x", [{ do: "speed", start: 5, end: 7, factor: 0.25 }]);
    check("speed up 1 to 4 3x", [{ do: "speed", start: 1, end: 4, factor: 3 }]);
    check("freeze at 6 for 2 seconds black and white", [{ do: "freeze", at: 6, duration: 2, bw: true }]);
    check("zoom in at 6", [{ do: "zoom", at: 6, duration: 1.2 }]);
    check("zoom 2x at 6 for 1.5s on the right", [{ do: "zoom", at: 6, duration: 1.5, amount: 2, x: 0.8 }]);
    check("shake at 11.5", [{ do: "shake", at: 11.5, duration: 0.5 }]);
    check("flash at 6", [{ do: "flash", at: 6 }]);
    check("make it black and white", [{ do: "color", style: "bw" }]);
    check("vibrant colors", [{ do: "color", style: "vibrant" }]);
    check("mute the game", [{ do: "volume", value: 0 }]);
  });
  test("text and stickers", () => {
    check('add text "EZ STEAL" at the top', [{ do: "text", text: "EZ STEAL", at: "start", position: "top" }]);
    check('caption "wait, and then 💀" at 6 for 2s', [{ do: "text", text: "wait, and then 💀", at: 6, duration: 2 }]);
    check("add a skull at the end", [{ do: "sticker", emoji: "💀", at: "end" }]);
    check("put 🔥 at 3 big", [{ do: "sticker", emoji: "🔥", at: 3, size: "big" }]);
    check("🗿🗿 at 4", [{ do: "sticker", emoji: "🗿", at: 4 }, { do: "sticker", emoji: "🗿", at: 4 }]);
  });
  test("sounds", () => {
    check("boom at 6", [{ do: "sound", name: "boom", at: 6 }]);
    check("add a vine boom sound at 6", [{ do: "sound", name: "boom", at: 6 }]);
    check("sad trombone at the end", [{ do: "sound", name: "fail_horn", at: "end" }]);
    check("play vine boom 2 at 3", [{ do: "sound", name: "vine_boom_2", at: 3 }]);
  });
  test("combined", () => {
    const got = parse("make it vertical, cut out 0 to 2 and add a skull at the end");
    assert.deepEqual(got.actions.map((a) => a.do), ["format", "remove", "sticker"]);
    assert.ok(got.confident);
  });
  test("deleting", () => {
    check("remove the zoom", [{ do: "delete", what: "zoom" }]);
    check("delete the zoom at 6", [{ do: "delete", what: "zoom", at: 6 }]);
    check("remove the skull", [{ do: "delete", what: "sticker", name: "💀" }]);
    check("get rid of the boom", [{ do: "delete", what: "sound", name: "boom" }]);
    check("no music", [{ do: "music", name: "none" }]);
    check("remove all effects", [{ do: "delete", what: "effects" }]);
    check("start over", [{ do: "clear" }]);
  });
  test("skills", () => {
    check("make a W edit at 6", [{ do: "apply_skill", skill: "steal_w", at: 6 }]);
    check("turn it into a fail edit", [{ do: "apply_skill", skill: "fail_l" }]);
    check("cut the boring loading part", [{ do: "apply_skill", skill: "cut_boring" }]);
    check("hype edit", [{ do: "apply_skill", skill: "hype" }]);
  });
  test("markers and here", () => {
    const marks = [{ t: 12.5, label: "steal" }];
    check("zoom on the steal", [{ do: "zoom", at: 12.5, duration: 1.2 }], true, { markers: marks });
    check("skull here", [{ do: "sticker", emoji: "💀", at: 4.2 }], true, { now: 4.2 });
    // the moment isn't known yet: leave it to the AI instead of guessing
    check("zoom on the steal", [], false);
  });
  test("undo and redo", () => {
    const got = parse("undo");
    assert.deepEqual([got.special, got.confident], ["undo", true]);
    assert.equal(parse("redo that").special, "redo");
  });
  test("left for the AI", () => {
    for (const text of ["what should I add?", "make it look cool", "make it funnier", "can you add some effects",
      "the fire rate was bad lol", "zoom", "make it better and shorter"]) {
      assert.equal(parse(text).confident, false, `${text} should go to the AI`);
    }
    assert.deepEqual(parse("make it look cool").actions, []);
    assert.deepEqual(parse("the fire rate was bad lol").actions, []);
  });
  test("every parse applies cleanly", () => {
    const texts = ["make it vertical", "trim from 3 to 12", "cut out 5 to 7", "slow mo at 6", "freeze at 6 bw",
      "zoom 2x at 6", 'add text "W" at the top', "add a skull at the end", "boom at 6",
      "make a W edit at 6", "fail edit at 20", "suspense at 10", "hype edit", "cut the boring part",
      "clean edit", "remove the zoom", "no music", "mute the game", "vibrant colors"];
    const c = cctx({ dead_start: 1.0, dead_end: 28.0, moments: [{ t: 12.0, kind: "loud" }],
      expand_skill: (a, p, cc) => K.expand(a, p, cc) });
    let plan = P.newPlan();
    for (const text of texts) {
      const got = C.parse(text, c);
      assert.ok(got.actions.length, text);
      const out = P.applyActions(plan, got.actions, c);
      plan = out.plan;
      assert.deepEqual(out.result.warnings.filter((w) => !w.includes("no zoom") && !w.includes("There's no")), [], text);
    }
  });
});

// ------------------------------------------------------------------ skills
describe("skills", () => {
  const make = (skill, at = null, extra = {}) => {
    const c = cctx({ dead_start: 2.0, dead_end: 27.0, sounds: BUILTIN_NAMES,
      moments: [{ t: 8.0, kind: "loud" }, { t: 20.0, kind: "still", end: 23.0 }], ...extra });
    c.expand_skill = (a, p, cc) => K.expand(a, p, cc);
    const act = { do: "apply_skill", skill };
    if (at !== null) act.at = at;
    const { plan, result } = P.applyActions(P.newPlan(), [act], c);
    assert.deepEqual(result.warnings, []);
    return [plan, new P.Timeline(plan, 30.0)];
  };
  test("W edit", () => {
    const [plan, tl] = make("steal_w", 12);
    assert.deepEqual(plan.keep, { start: 8, end: 15 });
    assert.equal(plan.speed.length, 1);
    assert.deepEqual(plan.sound.map((s) => s.name), ["whoosh", "boom", "victory"]);
    assert.ok(tl.duration > 7);
  });
  test("a fail edit ends on the fail", () => {
    const [plan, tl] = make("fail_l", 12);
    assert.deepEqual(plan.keep, { start: 8, end: 12.4 });
    assert.equal(plan.sticker[0].emoji, "💀");
    assert.ok(plan.freeze[0].bw);
    close(tl.duration, 4.4 + 2.2, 2);
  });
  test("skills use the marker, then the highlight", () => {
    let [plan] = make("fail_l", null, { markers: [{ t: 18.0, label: "fail" }] });
    assert.equal(plan.freeze[0].at, 18);
    [plan] = make("fail_l", null, { highlight: 9.0 });
    assert.equal(plan.freeze[0].at, 9);
  });
  test("switching skills replaces effects", () => {
    const c = cctx({ sounds: BUILTIN_NAMES });
    c.expand_skill = (a, p, cc) => K.expand(a, p, cc);
    let { plan } = P.applyActions(P.newPlan(), [{ do: "apply_skill", skill: "steal_w", at: 10 }], c);
    ({ plan } = P.applyActions(plan, [{ do: "apply_skill", skill: "fail_l", at: 10 }], c));
    assert.equal(plan.zoom.length, 1);
    assert.deepEqual(plan.speed, []);
  });
  test("cut boring and clean", () => {
    let [plan] = make("cut_boring");
    assert.deepEqual(plan.keep, { start: 2, end: 27 });
    assert.equal(plan.remove[0].start, 20);
    [plan] = make("clean");
    assert.deepEqual([plan.format, plan.keep], ["vertical", { start: 2, end: 27 }]);
  });
  test("every skill makes a valid timeline", () => {
    for (const name of Object.keys(K.SKILLS)) {
      const [, tl] = make(name, 10);
      assert.ok(tl.duration > 1, name);
    }
  });
});
