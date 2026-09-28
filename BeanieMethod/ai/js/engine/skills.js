/* Beanie edit skills: ready-made edit recipes for steal clips.
 *
 * Each skill turns one moment (the steal, the fail...) into a list of plan actions.
 * The AI picks a skill and a moment, then tweaks the result. The same recipes back
 * the quick buttons in the editor, so they work even without the AI.
 */

import { f1, parseTime, round } from "./plan.js";

const W_CAPTIONS = ["EZ STEAL 😈", "TOO EASY 🔥", "THEY DIDN'T SEE IT 👀", "W STEAL 🏆", "SECURED 💰"];
const L_CAPTIONS = ["bro thought 💀", "NOT THE LASERS 💀", "it was all going so well...", "L STEAL 💀",
  "caught in 4K 📸"];
const SUSPENSE_CAPTIONS = ["wait for it... 👀", "he has no idea... 👀", "3... 2... 1..."];
const HYPE_CAPTIONS = ["LET'S GOOO 🔥", "INSANE STEAL 🤯", "NO WAY 😱"];

export const SKILLS = {
  steal_w: {
    title: "W steal edit",
    about: "A winning steal: trims to the action, slow-mo + zoom + flash + boom on the grab, "
      + "hype caption at the start and a victory sound at the end.",
  },
  fail_l: {
    title: "L fail edit 💀",
    about: "A fail (base locked, got hit, got caught): ends right after the fail with a black & white "
      + "freeze, zoom, big 💀, boom and a funny caption.",
  },
  suspense: {
    title: "Suspense build-up",
    about: "Builds tension before the moment: ticking clock, slow push-in zoom and slow-mo, "
      + "then flash + bass drop + shake on the moment.",
  },
  hype: {
    title: "Hype edit",
    about: "Fast and loud: bright colors, quick zooms on the loud moments, air horn and shake on the "
      + "main moment.",
  },
  clean: {
    title: "Clean vertical",
    about: "Just the good part in 9:16 with a blurred background: cuts the boring start and end, no effects.",
  },
  cut_boring: {
    title: "Cut the boring parts",
    about: "Removes loading screens, menus and parts where nothing moves.",
  },
  slowmo: {
    title: "Slow-mo moment",
    about: "Slows down 1.5 s around the moment with a whoosh.",
  },
  freeze_skull: {
    title: "Freeze + 💀",
    about: "Freezes the moment in black & white with a big 💀 and a boom (doesn't trim).",
  },
};

const ALIASES = { w: "steal_w", win: "steal_w", steal: "steal_w", l: "fail_l", fail: "fail_l",
  freeze: "freeze_skull", skull: "freeze_skull", boring: "cut_boring" };

/** The moment a skill is about: the time asked for, else the last marker, else the analysis guess. */
export function moment(action, plan, ctx) {
  const duration = ctx.duration;
  const raw = action.at;
  let t = raw !== null && raw !== undefined ? parseTime(raw, ctx) : null;
  if (t === "start") t = 0;
  else if (t === "end") t = duration;
  if (t === null) {
    const markers = ctx.markers || [];
    if (markers.length) t = Number(markers[markers.length - 1].t);
    else if (ctx.highlight !== null && ctx.highlight !== undefined) t = Number(ctx.highlight);
    else t = duration / 2;
  }
  return round(Math.max(0, Math.min(duration, t)), 3);
}

/** The part of the clip that isn't loading screens or menus. */
function liveRange(ctx) {
  const start = Number(ctx.dead_start || 0);
  const end = ctx.dead_end !== null && ctx.dead_end !== undefined ? Number(ctx.dead_end) : ctx.duration;
  if (end - start < 1.0) return [0, ctx.duration];
  return [start, end];
}

function keepAround(m, before, after, ctx) {
  const [lo, hi] = liveRange(ctx);
  let start = Math.max(lo, m - before);
  let end = Math.min(hi, m + after);
  if (end - start < 1.0) {
    start = Math.max(0, m - before);
    end = Math.min(ctx.duration, m + after);
  }
  return { do: "keep", start: round(start, 3), end: round(end, 3) };
}

const choose = (options, rng) => options[Math.floor(rng() * options.length) % options.length];

/**
 * Actions for an apply_skill action. Returns [actions, label].
 *
 * The full-edit skills (W, L, suspense, hype) start from a clean plan so switching
 * from one to another doesn't pile effects up; the smaller ones add to what's there.
 */
export function expand(action, plan, ctx, rng = Math.random) {
  let name = String(action.skill ?? "").trim().toLowerCase();
  name = ALIASES[name] || name;
  if (!SKILLS[name]) {
    throw new Error(`I don't have a skill called '${action.skill}'. I have: ${Object.keys(SKILLS).join(", ")}.`);
  }
  const m = moment(action, plan, ctx);
  const duration = ctx.duration;
  let acts = [];

  if (name === "steal_w") {
    acts.push({ do: "clear" });
    const keep = keepAround(m, 4.0, 3.0, ctx);
    acts.push(keep,
      { do: "speed", start: Math.max(keep.start, m - 0.6), end: Math.min(keep.end, m + 0.4), factor: 0.5 },
      { do: "zoom", at: m, duration: 1.4, amount: 1.35 },
      { do: "flash", at: m },
      { do: "sound", name: "whoosh", at: Math.max(keep.start, m - 0.6) },
      { do: "sound", name: "boom", at: m },
      { do: "text", text: choose(W_CAPTIONS, rng), at: "start", duration: 2.5, position: "top" },
      { do: "sticker", emoji: choose(["🔥", "😈", "🏆"], rng), at: "end", duration: 1.6, position: "middle", size: "big" },
      { do: "sound", name: "victory", at: "end" },
      { do: "color", style: "vibrant" });
  } else if (name === "fail_l") {
    acts.push({ do: "clear" });
    const keep = keepAround(m, 4.0, 0.4, ctx);
    acts.push(keep,
      { do: "freeze", at: m, duration: 2.2, bw: true },
      { do: "zoom", at: m, duration: 2.2, amount: 1.5 },
      { do: "sticker", emoji: "💀", at: m, duration: 2.2, position: "middle", size: "big" },
      { do: "sound", name: "boom", at: m },
      { do: "text", text: choose(L_CAPTIONS, rng), at: m, duration: 2.2, position: "top" });
  } else if (name === "suspense") {
    acts.push({ do: "clear" });
    const keep = keepAround(m, 6.0, 3.0, ctx);
    const start = keep.start;
    acts.push(keep,
      { do: "sound", name: "tick", at: Math.max(start, m - 2.6) },
      { do: "speed", start: Math.max(start, m - 1.2), end: m, factor: 0.5 },
      { do: "zoom", at: Math.max(start, m - 1.2), duration: 2.4, amount: 1.2 },
      { do: "text", text: choose(SUSPENSE_CAPTIONS, rng), at: "start", duration: 2.5, position: "top" },
      { do: "flash", at: m },
      { do: "shake", at: m, duration: 0.5 },
      { do: "sound", name: "bass_drop", at: m });
  } else if (name === "hype") {
    const louds = (ctx.moments || []).filter((mm) => mm.kind === "loud" && Math.abs(mm.t - m) > 1.0).map((mm) => mm.t);
    const keep = keepAround(m, 6.0, 4.0, ctx);
    acts.push({ do: "clear" }, keep, { do: "color", style: "vibrant" },
      { do: "text", text: choose(HYPE_CAPTIONS, rng), at: "start", duration: 2.0, position: "top" },
      { do: "zoom", at: m, duration: 1.0, amount: 1.4 },
      { do: "shake", at: m, duration: 0.6 },
      { do: "sound", name: "airhorn", at: m },
      { do: "sticker", emoji: "🔥", at: "end", duration: 1.4, position: "middle" });
    for (const t of louds.slice(0, 3)) {
      if (keep.start <= t && t <= keep.end) {
        acts.push({ do: "zoom", at: t, duration: 0.5, amount: 1.25 },
          { do: "sound", name: "whoosh", at: Math.max(keep.start, t - 0.3) });
      }
    }
  } else if (name === "clean") {
    const [lo, hi] = liveRange(ctx);
    acts.push({ do: "delete", what: "all" }, { do: "format", format: "vertical", fit: "blur" },
      { do: "keep", start: lo, end: hi });
  } else if (name === "cut_boring") {
    const [lo, hi] = liveRange(ctx);
    acts.push({ do: "keep", start: lo, end: hi });
    for (const mm of ctx.moments || []) {
      if ((mm.kind === "dark" || mm.kind === "still") && mm.end !== undefined && mm.end - mm.t >= 1.5) {
        if (mm.t > lo + 0.1 && mm.end < hi - 0.1) acts.push({ do: "remove", start: mm.t, end: mm.end });
      }
    }
  } else if (name === "slowmo") {
    acts.push({ do: "speed", start: Math.max(0, m - 0.75), end: Math.min(duration, m + 0.75), factor: 0.4 },
      { do: "sound", name: "whoosh", at: Math.max(0, m - 0.75) });
  } else if (name === "freeze_skull") {
    acts.push({ do: "freeze", at: m, duration: 2.0, bw: true },
      { do: "zoom", at: m, duration: 2.0, amount: 1.4 },
      { do: "sticker", emoji: "💀", at: m, duration: 2.0, position: "middle", size: "big" },
      { do: "sound", name: "boom", at: m });
  }

  // Drop sounds that aren't available (a user sound can't replace a built-in by accident).
  const sounds = new Set(ctx.sounds || []);
  acts = acts.filter((a) => a.do !== "sound" || sounds.has(a.name));
  return [acts, `${SKILLS[name].title} at ${f1(m)}s`];
}

/** The skill list for the AI's instructions. */
export function playbookText() {
  return Object.entries(SKILLS).map(([name, s]) => `- ${name}: ${s.title} - ${s.about}`).join("\n");
}
