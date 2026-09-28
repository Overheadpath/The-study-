/* The edit plan: every change to a clip, stored as plain data.
 *
 * The AI, the instant-command parser and the buttons all change the plan through actions
 * (small objects like {do: "zoom", at: 6}). applyActions checks and fixes every value,
 * so whatever the AI writes, the plan stays something the video maker can make.
 *
 * Times the AI and user talk about are clip times: seconds in the original recording.
 * Timeline turns those into times in the finished video (after cuts, speed changes and freezes).
 */

export const POSITIONS = ["top", "middle", "bottom"];
export const SIZES = ["small", "medium", "big"];
export const FORMATS = ["vertical", "original", "square"];
export const FITS = ["blur", "crop", "bars"];
export const COLORS = ["none", "vibrant", "cinematic", "bw", "warm", "cold", "retro"];
export const TEXT_COLORS = ["white", "yellow", "red", "green", "blue", "pink", "orange", "purple", "black"];
export const LIST_KINDS = ["remove", "speed", "freeze", "zoom", "shake", "flash", "text", "sticker", "sound"];
export const LIMITS = {
  remove: 12, speed: 8, freeze: 6, zoom: 12, shake: 12, flash: 12, text: 12, sticker: 12, sound: 24,
};
export const ACTIONS = ["apply_skill", "keep", "remove", "speed", "freeze", "zoom", "shake", "flash", "text",
  "sticker", "sound", "music", "format", "color", "volume", "delete", "clear"];

export const KIND_ALIASES = {
  cut: "remove", cuts: "remove", removes: "remove",
  slowmo: "speed", "slow-mo": "speed", slow_mo: "speed", speeds: "speed",
  freezes: "freeze", zooms: "zoom", shakes: "shake", flashes: "flash",
  texts: "text", caption: "text", captions: "text", words: "text", title: "text",
  stickers: "sticker", emoji: "sticker", emojis: "sticker",
  sounds: "sound", sfx: "sound", effect: "sound", songs: "music", song: "music",
  trim: "keep", colour: "color", filter: "color",
};

const POSITION_ALIASES = { center: "middle", centre: "middle", mid: "middle", up: "top",
  down: "bottom", above: "top", below: "bottom" };
const SIZE_ALIASES = { large: "big", huge: "big", giant: "big", "medium-size": "medium",
  normal: "medium", tiny: "small", little: "small" };

export function newPlan() {
  return {
    format: "vertical",   // vertical 9:16, original, or square
    fit: "blur",          // how a wide video fits a tall frame: blur (nothing cut), crop, or bars
    focus_x: 0.5,         // crop mode: which part to keep, 0 = left edge, 1 = right edge
    keep: null,           // {start, end}: the part of the clip to use (null = all)
    remove: [],           // parts cut out
    speed: [],            // slow-mo / fast parts
    freeze: [],           // freeze frames
    zoom: [],
    shake: [],
    flash: [],
    text: [],             // captions
    sticker: [],          // emoji stickers
    sound: [],            // sound effects
    music: null,          // {name, volume}
    color: "none",
    game_volume: 1.0,
  };
}

// ------------------------------------------------------------------ small helpers

export function newId() {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Round like Python's round(x, n) for the values we use (never -0). */
export function round(x, n = 0) {
  const f = 10 ** n;
  const v = Math.round((x + Math.sign(x) * Number.EPSILON) * f) / f;
  return Object.is(v, -0) ? 0 : v;
}

/** A number written short, like Python's f"{x:g}". */
export function g(x) {
  return String(Number(Number(x).toPrecision(6)));
}

export function f1(x) {
  return Number(x).toFixed(1);
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function num(value, dflt = null) {
  if (typeof value === "boolean") return dflt;
  if (isNum(value)) return value;
  if (typeof value === "string") {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*(?:x|×|%|s|sec|secs|seconds?)?\s*$/.exec(value);
    if (m) {
      const v = parseFloat(m[1]);
      return value.trim().endsWith("%") ? v / 100 : v;
    }
  }
  return dflt;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function deepEqual(a, b) {
  return stableJson(a) === stableJson(b);
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * A clip time in seconds, or "start" / "end". null if it can't be understood.
 *
 * Understands 12, "12.5", "12s", "0:12", "1:02.5", "start", "end", marker names
 * ("steal") and "highlight" (the best moment the analysis found).
 */
export function parseTime(value, ctx) {
  const duration = ctx.duration || 0;
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (typeof value === "number") return isNum(value) ? round(clamp(value, 0, duration), 3) : null;
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (["start", "beginning", "begin", "0", "the start", "the beginning"].includes(text)) return "start";
  if (["end", "the end", "ending", "last"].includes(text)) return "end";
  let m = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(text);
  if (m) return round(clamp(parseInt(m[1], 10) * 60 + parseFloat(m[2]), 0, duration), 3);
  const n = num(text);
  if (n !== null) return round(clamp(n, 0, duration), 3);
  const wanted = text.replace(/the /g, "").replace(/my /g, "").trim();
  const markers = ctx.markers || [];
  for (const mk of markers) {
    const label = String(mk.label ?? "").toLowerCase().trim();
    if (wanted && label && (wanted === label || wanted.includes(label) || label.includes(wanted))) {
      return round(clamp(Number(mk.t), 0, duration), 3);
    }
  }
  if (["highlight", "best", "best moment", "main moment", "moment", "mark", "marker", "steal"].includes(wanted)) {
    if (markers.length) return round(Number(markers[markers.length - 1].t), 3);
    if (ctx.highlight !== null && ctx.highlight !== undefined) return round(Number(ctx.highlight), 3);
  }
  return null;
}

function pick(value, options, aliases = null, dflt = null) {
  if (typeof value === "string") {
    let v = value.trim().toLowerCase();
    if (aliases && Object.prototype.hasOwnProperty.call(aliases, v)) v = aliases[v];
    if (options.includes(v)) return v;
  }
  return dflt;
}

export class ActionResult {
  constructor() {
    this.done = [];       // short descriptions of what changed
    this.warnings = [];   // things that were fixed or skipped
  }
}

class StepError extends Error {}

/** Apply actions to a copy of plan. Returns {plan, result}. */
export function applyActions(plan, actions, ctx) {
  plan = plan ? structuredClone(plan) : newPlan();
  const result = new ActionResult();
  let queue = (Array.isArray(actions) ? actions : []).slice(0, 40);
  let expanded = 0;
  while (queue.length) {
    const action = queue.shift();
    if (!action || typeof action !== "object" || Array.isArray(action)) continue;
    const doRaw = action.do;
    const doName = (doRaw === null || doRaw === undefined ? "" : String(doRaw)).trim().toLowerCase();
    if (doName === "apply_skill") {
      const expand = ctx.expand_skill;
      if (expand && expanded < 4) {
        expanded += 1;
        let more;
        let label;
        try {
          [more, label] = expand(action, plan, ctx);
        } catch (e) {
          result.warnings.push(e.message);
          continue;
        }
        queue = more.concat(queue);
        if (label) result.done.push(label);
      }
      continue;
    }
    const handler = HANDLERS[doName];
    if (!handler) {
      if (doName) result.warnings.push(`I don't know how to '${doName}' yet.`);
      continue;
    }
    try {
      handler(plan, action, ctx, result);
    } catch (e) {
      result.warnings.push(`Skipped a '${doName}' step (${e.message}).`);
    }
  }
  return { plan, result };
}

function timeOrWarn(action, key, ctx, result, dflt = null) {
  const raw = action[key] === undefined ? dflt : action[key];
  const t = parseTime(raw, ctx);
  if (t === null && raw !== null && raw !== undefined) {
    result.warnings.push(`I couldn't tell what time '${typeof raw === "string" ? raw : JSON.stringify(raw)}' means.`);
  }
  return t;
}

function add(plan, kind, item, result) {
  const items = plan[kind];
  if (items.length >= LIMITS[kind]) {
    result.warnings.push(`That's the most ${kind} steps one video can have (${LIMITS[kind]}).`);
    return false;
  }
  item.id = newId();
  items.push(item);
  return true;
}

function doKeep(plan, a, ctx, r) {
  const duration = ctx.duration;
  let start = parseTime(a.start === undefined ? 0 : a.start, ctx);
  let end = parseTime(a.end === undefined ? duration : a.end, ctx);
  start = start === null || start === "start" ? 0 : start === "end" ? duration : start;
  end = end === null || end === "end" ? duration : end === "start" ? 0 : end;
  if (end < start) [start, end] = [end, start];
  if (end - start < 0.3) {
    r.warnings.push("That part is too short to make a video from.");
    return;
  }
  if (start <= 0.01 && end >= duration - 0.01) {
    plan.keep = null;
    r.done.push("Using the whole clip");
  } else {
    plan.keep = { start, end };
    r.done.push(`Using ${f1(start)}s to ${f1(end)}s`);
  }
}

function range(a, ctx) {
  const duration = ctx.duration;
  let start = parseTime(a.start, ctx);
  let end = parseTime(a.end, ctx);
  if (start === "start") start = 0;
  if (end === "end") end = duration;
  if (start === "end" || end === "start") {
    start = null;
    end = null;
  }
  if (start === null && end === null) {
    const at = parseTime(a.at, ctx);
    if (typeof at === "number") {
      const length = num(a.duration, 1.0);
      start = at;
      end = Math.min(duration, at + length);
    }
  }
  if (start === null || end === null) throw new StepError("it needs a start and an end time");
  if (end < start) [start, end] = [end, start];
  return [round(start, 3), round(end, 3)];
}

function doRemove(plan, a, ctx, r) {
  const [start, end] = range(a, ctx);
  if (end - start < 0.05) {
    r.warnings.push("That part is too short to cut out.");
    return;
  }
  const merged = [{ start, end }];
  for (const old of plan.remove) {
    if (old.end < start || old.start > end) {
      merged.push(old);
    } else {
      merged[0].start = Math.min(merged[0].start, old.start);
      merged[0].end = Math.max(merged[0].end, old.end);
    }
  }
  plan.remove = [];
  for (const item of merged.sort((x, y) => x.start - y.start)) {
    if (!add(plan, "remove", { start: item.start, end: item.end }, r)) break;
  }
  r.done.push(`Cut out ${f1(start)}s to ${f1(end)}s`);
}

function doSpeed(plan, a, ctx, r) {
  const [start, end] = range(a, ctx);
  const factor = clamp(num(a.factor, 0.5), 0.25, 4.0);
  if (end - start < 0.1) {
    r.warnings.push("That part is too short to change the speed of.");
    return;
  }
  const kept = [];
  for (const old of plan.speed) {
    if (old.end <= start || old.start >= end) {
      kept.push(old);
      continue;
    }
    if (old.start < start) kept.push({ ...old, end: start, id: newId() });
    if (old.end > end) kept.push({ ...old, start: end, id: newId() });
  }
  plan.speed = kept.sort((x, y) => x.start - y.start);
  if (Math.abs(factor - 1.0) < 0.01) {
    r.done.push(`Normal speed from ${f1(start)}s to ${f1(end)}s`);
    return;
  }
  if (add(plan, "speed", { start, end, factor: round(factor, 3) }, r)) {
    plan.speed.sort((x, y) => x.start - y.start);
    const what = factor < 1 ? `Slow-mo ${g(factor)}x` : `Speed up ${g(factor)}x`;
    r.done.push(`${what} from ${f1(start)}s to ${f1(end)}s`);
  }
}

function point(a, ctx, r, allowSpecial = true) {
  let t = timeOrWarn(a, "at", ctx, r);
  if (t === null) throw new StepError("it needs a time");
  if (!allowSpecial && typeof t === "string") t = t === "end" ? ctx.duration : 0;
  return t;
}

export function fmtAt(t) {
  if (typeof t === "string") return { start: "the start", end: "the end" }[t] || t;
  return `${f1(t)}s`;
}

function doFreeze(plan, a, ctx, r) {
  const at = point(a, ctx, r);
  const duration = round(clamp(num(a.duration, 1.5), 0.2, 6.0), 2);
  const bwRaw = a.bw !== undefined ? a.bw : (a.black_and_white !== undefined ? a.black_and_white : false);
  const bw = Boolean(bwRaw);
  plan.freeze = plan.freeze.filter((f) => f.at !== at);
  if (add(plan, "freeze", { at, duration, bw }, r)) {
    r.done.push(`Freeze at ${fmtAt(at)} for ${g(duration)}s${bw ? " (black & white)" : ""}`);
  }
}

function doZoom(plan, a, ctx, r) {
  const at = point(a, ctx, r);
  const item = {
    at,
    duration: round(clamp(num(a.duration, 1.0), 0.2, 10.0), 2),
    amount: round(clamp(num(a.amount, 1.4), 1.05, 3.0), 2),
    x: round(clamp(num(a.x, 0.5), 0.0, 1.0), 3),
    y: round(clamp(num(a.y, 0.5), 0.0, 1.0), 3),
  };
  if (add(plan, "zoom", item, r)) r.done.push(`Zoom ${g(item.amount)}x at ${fmtAt(at)}`);
}

function doShake(plan, a, ctx, r) {
  const at = point(a, ctx, r);
  const item = {
    at,
    duration: round(clamp(num(a.duration, 0.5), 0.1, 5.0), 2),
    strength: round(clamp(num(a.strength, 1.0), 0.2, 3.0), 2),
  };
  if (add(plan, "shake", item, r)) r.done.push(`Shake at ${fmtAt(at)}`);
}

function doFlash(plan, a, ctx, r) {
  const at = point(a, ctx, r);
  if (add(plan, "flash", { at }, r)) r.done.push(`Flash at ${fmtAt(at)}`);
}

function cleanText(value, limit) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return Array.from(text).slice(0, limit).join("");
}

function doText(plan, a, ctx, r) {
  const text = cleanText(a.text, 80);
  if (!text) throw new StepError("there were no words to show");
  const at = a.at !== null && a.at !== undefined ? point(a, ctx, r) : "start";
  const item = {
    text,
    at,
    duration: round(clamp(num(a.duration, 2.5), 0.3, 30.0), 2),
    position: pick(a.position, POSITIONS, POSITION_ALIASES, "top"),
    size: pick(a.size, SIZES, SIZE_ALIASES, "medium"),
    color: pick(a.color, TEXT_COLORS, null, "white"),
  };
  if (add(plan, "text", item, r)) r.done.push(`Caption "${text}" at ${fmtAt(at)}`);
}

function doSticker(plan, a, ctx, r) {
  const emoji = cleanText(a.emoji || a.text, 16);
  if (!emoji) throw new StepError("there was no emoji");
  const at = a.at !== null && a.at !== undefined ? point(a, ctx, r) : "end";
  const item = {
    emoji,
    at,
    duration: round(clamp(num(a.duration, 1.5), 0.3, 30.0), 2),
    position: pick(a.position, POSITIONS, POSITION_ALIASES, "middle"),
    size: pick(a.size, SIZES, SIZE_ALIASES, "big"),
  };
  if (add(plan, "sticker", item, r)) r.done.push(`${emoji} sticker at ${fmtAt(at)}`);
}

/** Find a sound by a loose name: 'Vine Boom' finds 'vine_boom', 'boom' finds 'boom'. */
export function matchName(name, available) {
  if (!name) return null;
  const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const want = squash(name);
  if (!want) return null;
  const names = Array.from(available || []);
  for (const n of names) if (squash(n) === want) return n;
  for (const n of names) {
    const s = squash(n);
    if (s.includes(want) || want.includes(s)) return n;
  }
  return null;
}

function doSound(plan, a, ctx, r) {
  const available = ctx.sounds || [];
  const name = matchName(a.name, available);
  if (!name) {
    r.warnings.push(`I don't have a sound called '${a.name}'. I have: ${[...available].sort().slice(0, 20).join(", ")}.`);
    return;
  }
  const at = point(a, ctx, r);
  const item = { name, at, volume: round(clamp(num(a.volume, 1.0), 0.0, 2.0), 2) };
  if (add(plan, "sound", item, r)) r.done.push(`Sound '${name}' at ${fmtAt(at)}`);
}

function doMusic(plan, a, ctx, r) {
  const raw = a.name;
  if (raw === null || raw === undefined || ["", "none", "off", "no", "stop"].includes(String(raw).trim().toLowerCase())) {
    plan.music = null;
    r.done.push("No music");
    return;
  }
  const songs = ctx.music || [];
  const name = matchName(raw, songs);
  if (!name) {
    r.warnings.push(!songs.length ? "Add a song in 🔊 Sounds → My Music first."
      : `I don't have a song called '${raw}'. I have: ${songs.slice(0, 12).join(", ")}.`);
    return;
  }
  plan.music = { name, volume: round(clamp(num(a.volume, 0.35), 0.0, 1.5), 2) };
  r.done.push(`Music: ${name}`);
}

const FORMAT_NAMES = { vertical: "Vertical 9:16", original: "Original shape", square: "Square 1:1" };
const FIT_NAMES = { blur: "blurred background", crop: "cropped to fill", bars: "black bars" };

function doFormat(plan, a, ctx, r) {
  const fmt = pick(a.format, FORMATS, {
    tiktok: "vertical", shorts: "vertical", portrait: "vertical", tall: "vertical", "9:16": "vertical",
    landscape: "original", wide: "original", "16:9": "original", youtube: "original",
    "1:1": "square", instagram: "square",
  });
  const fit = pick(a.fit, FITS, {
    blurred: "blur", background: "blur", zoom: "crop", fill: "crop", cropped: "crop",
    black: "bars", letterbox: "bars", fit: "bars",
  });
  if (fmt) plan.format = fmt;
  if (fit) plan.fit = fit;
  const x = num(a.x);
  if (x !== null) plan.focus_x = round(clamp(x, 0.0, 1.0), 3);
  if (!(fmt || fit || x !== null)) throw new StepError("it needs a format like vertical, original or square");
  const extra = plan.format !== "original" ? ` (${FIT_NAMES[plan.fit]})` : "";
  r.done.push(FORMAT_NAMES[plan.format] + extra);
}

function doColor(plan, a, ctx, r) {
  const style = pick(a.style || a.name, COLORS, {
    off: "none", normal: "none", vivid: "vibrant", saturated: "vibrant",
    "black and white": "bw", "black & white": "bw", grey: "bw", gray: "bw",
    movie: "cinematic", film: "cinematic", cool: "cold", blue: "cold",
    orange: "warm", old: "retro", vintage: "retro",
  });
  if (!style) throw new StepError(`the color style should be one of: ${COLORS.join(", ")}`);
  plan.color = style;
  r.done.push(style === "none" ? "Normal colors" : `Color: ${style}`);
}

function doVolume(plan, a, ctx, r) {
  let value = num(a.value !== undefined ? a.value : a.volume);
  if (value === null) throw new StepError("it needs a volume");
  if (value > 2.0) value /= 100.0;
  plan.game_volume = round(clamp(value, 0.0, 2.0), 2);
  r.done.push(`Game sound at ${Math.trunc(plan.game_volume * 100)}%`);
}

function doDelete(plan, a, ctx, r) {
  const itemId = a.id;
  if (itemId) {
    for (const kind of LIST_KINDS) {
      const before = plan[kind].length;
      plan[kind] = plan[kind].filter((i) => i.id !== itemId);
      if (plan[kind].length < before) {
        r.done.push(`Removed a ${kind} step`);
        return;
      }
    }
    for (const [key, value] of [["keep", null], ["music", null], ["color", "none"], ["game_volume", 1.0]]) {
      if (itemId === key) {
        plan[key] = value;
        r.done.push(`Removed the ${key} step`);
        return;
      }
    }
    if (itemId === "format") {
      plan.format = "original";
      plan.fit = "blur";
      plan.focus_x = 0.5;
      r.done.push("Back to the original shape");
      return;
    }
    r.warnings.push("That step was already gone.");
    return;
  }
  let what = String(a.what ?? "").trim().toLowerCase();
  what = KIND_ALIASES[what] || what;
  if (["all", "everything", "effects"].includes(what)) {
    const kinds = what !== "effects" ? LIST_KINDS : ["zoom", "shake", "flash", "freeze", "speed"];
    for (const kind of kinds) plan[kind] = [];
    if (what !== "effects") {
      plan.keep = null;
      plan.music = null;
      plan.color = "none";
    }
    r.done.push(what === "effects" ? "Removed all effects" : "Removed everything");
    return;
  }
  if (["keep", "music", "color"].includes(what)) {
    plan[what] = what !== "color" ? null : "none";
    r.done.push(`Removed the ${what} step`);
    return;
  }
  if (!LIST_KINDS.includes(what)) throw new StepError(`I can remove: ${LIST_KINDS.join(", ")}`);
  const items = plan[what];
  if (!items.length) {
    r.warnings.push(`There's no ${what} to remove.`);
    return;
  }
  const name = String(a.name || "").trim().toLowerCase();
  if (name) {
    const label = (i) => String(i.name || i.emoji || i.text || "").toLowerCase();
    const keep = items.filter((i) => !label(i).includes(name) && !name.includes(label(i)));
    if (keep.length === items.length) {
      r.warnings.push(`There's no ${what} called '${name}'.`);
    } else {
      plan[what] = keep;
      r.done.push(`Removed ${items.length - keep.length} ${what} step(s)`);
    }
    return;
  }
  const at = a.at !== null && a.at !== undefined ? parseTime(a.at, ctx) : null;
  const index = a.index;
  const indexWord = String(index).toLowerCase();
  if (typeof at === "number") {
    const dist = (i) => {
      const t = i.at !== undefined ? i.at : i.start;
      return typeof t === "number" ? Math.abs(t - at) : 1e9;
    };
    let target = items[0];
    for (const i of items) if (dist(i) < dist(target)) target = i;
    plan[what] = items.filter((i) => i !== target);
    r.done.push(`Removed the ${what} near ${f1(at)}s`);
  } else if (Number.isInteger(index) || indexWord === "last" || indexWord === "first") {
    const idx = indexWord === "last" ? -1 : indexWord === "first" ? 0 : index;
    if (idx >= -items.length && idx < items.length) {
      items.splice(idx < 0 ? items.length + idx : idx, 1);
      r.done.push(`Removed a ${what} step`);
    } else {
      r.warnings.push(`There isn't a ${what} number ${idx + 1}.`);
    }
  } else {
    plan[what] = [];
    r.done.push(`Removed all ${what} steps`);
  }
}

function doClear(plan, a, ctx, r) {
  const fresh = newPlan();
  for (const key of ["format", "fit", "focus_x"]) {
    if (plan[key] !== undefined) fresh[key] = plan[key];
  }
  for (const key of Object.keys(plan)) delete plan[key];
  Object.assign(plan, fresh);
  r.done.push("Started over");
}

const HANDLERS = {
  keep: doKeep, trim: doKeep, remove: doRemove, cut: doRemove,
  speed: doSpeed, slowmo: doSpeed, freeze: doFreeze, zoom: doZoom,
  shake: doShake, flash: doFlash, text: doText, caption: doText,
  sticker: doSticker, emoji: doSticker, sound: doSound, sfx: doSound,
  music: doMusic, format: doFormat, color: doColor, volume: doVolume,
  delete: doDelete, clear: doClear,
};

// ------------------------------------------------------------------ the timeline

/**
 * Maps clip time to finished-video time for a plan.
 *
 * segments are, in order: {kind: "clip", src_start, src_end, speed, out_start, out_end}
 * or {kind: "freeze", src_at, duration, bw, out_start, out_end}.
 */
export class Timeline {
  constructor(plan, clipDuration, fps = 30) {
    this.plan = plan;
    this.clipDuration = clipDuration;
    this.frame = 1 / Math.max(fps, 1);
    this.moved = [];  // freeze times that were inside cut-out parts
    this.segments = this.build();
    this.duration = this.segments.length ? this.segments[this.segments.length - 1].out_end : 0;
  }

  keptRange() {
    const keep = this.plan.keep;
    if (keep) return [Math.max(0, keep.start), Math.min(this.clipDuration, keep.end)];
    return [0, this.clipDuration];
  }

  build() {
    const [start, end] = this.keptRange();
    let intervals = [[start, end]];
    const removes = [...(this.plan.remove || [])].sort((x, y) => x.start - y.start);
    for (const rm of removes) {
      const next = [];
      for (const [a, b] of intervals) {
        if (rm.end <= a || rm.start >= b) {
          next.push([a, b]);
          continue;
        }
        if (rm.start > a) next.push([a, rm.start]);
        if (rm.end < b) next.push([rm.end, b]);
      }
      intervals = next;
    }
    intervals = intervals.filter(([a, b]) => b - a >= 0.04);
    if (!intervals.length) intervals = [[start, end]];

    const speeds = this.plan.speed || [];
    const pieces = [];
    for (const [a, b] of intervals) {
      const points = new Set([a, b]);
      for (const s of speeds) {
        if (s.end > a && s.start < b) {
          points.add(Math.max(a, s.start));
          points.add(Math.min(b, s.end));
        }
      }
      const pts = [...points].sort((x, y) => x - y);
      for (let i = 0; i + 1 < pts.length; i++) {
        const p = pts[i];
        const q = pts[i + 1];
        if (q - p < 0.02) continue;
        const mid = (p + q) / 2;
        let factor = 1.0;
        for (const s of speeds) if (s.start <= mid && mid <= s.end) factor = s.factor;
        pieces.push({ kind: "clip", src_start: p, src_end: q, speed: factor });
      }
    }

    const lastFrame = Math.max(0, end - this.frame);
    const freezes = [...(this.plan.freeze || [])].sort(
      (x, y) => this.freezeTime(x.at, start, end) - this.freezeTime(y.at, start, end));
    for (const fr of freezes) {
      const t = this.freezeTime(fr.at, start, end);
      const freeze = { kind: "freeze", src_at: Math.min(t, lastFrame), duration: fr.duration, bw: Boolean(fr.bw) };
      let placed = false;
      for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        if (piece.kind !== "clip") continue;
        if (piece.src_start - 1e-6 <= t && t <= piece.src_end + 1e-6) {
          if (t - piece.src_start < 0.02) {
            pieces.splice(i, 0, freeze);
          } else if (piece.src_end - t < 0.02) {
            pieces.splice(i + 1, 0, freeze);
          } else {
            const left = { ...piece, src_end: t };
            const right = { ...piece, src_start: t };
            pieces.splice(i, 1, left, freeze, right);
          }
          placed = true;
          break;
        }
      }
      if (!placed) {
        const later = [];
        pieces.forEach((p, i) => { if (p.kind === "clip" && p.src_start >= t) later.push(i); });
        this.moved.push(t);
        if (later.length) {
          freeze.src_at = pieces[later[0]].src_start;
          pieces.splice(later[0], 0, freeze);
        } else {
          const clips = pieces.filter((p) => p.kind === "clip");
          freeze.src_at = clips.length ? Math.max(0, clips[clips.length - 1].src_end - this.frame) : 0;
          pieces.push(freeze);
        }
      }
    }

    let out = 0;
    for (const p of pieces) {
      p.out_start = round(out, 4);
      out += p.kind === "clip" ? (p.src_end - p.src_start) / p.speed : p.duration;
      p.out_end = round(out, 4);
    }
    return pieces;
  }

  freezeTime(at, start, end) {
    if (at === "start") return start;
    if (at === "end" || at === null || at === undefined) return end;
    return Number(at);
  }

  /**
   * Finished-video time for clip time t. Cut-out times move to the next kept moment.
   * A time that has a freeze lands on the start of the freeze, so a sticker or sound
   * "at the freeze" shows during it.
   */
  toOutput(t) {
    for (const seg of this.segments) {
      if (seg.kind === "freeze" && Math.abs(seg.src_at - t) < 0.02) return seg.out_start;
      if (seg.kind === "clip" && seg.src_start - 1e-6 <= t && t <= seg.src_end + 1e-6) {
        return seg.out_start + (t - seg.src_start) / seg.speed;
      }
    }
    for (const seg of this.segments) {
      if (seg.kind === "clip" && seg.src_start >= t) return seg.out_start;
    }
    return this.duration;
  }

  /** The segment playing at finished-video time tOut (the last one after the end). */
  segmentAt(tOut) {
    const segs = this.segments;
    for (let i = 0; i < segs.length; i++) {
      if (tOut < segs[i].out_end - 1e-9) return i;
    }
    return segs.length - 1;
  }

  /** Clip time shown at finished-video time tOut. */
  toSource(tOut) {
    for (const seg of this.segments) {
      if (seg.out_start - 1e-6 <= tOut && tOut <= seg.out_end + 1e-6) {
        if (seg.kind === "freeze") return seg.src_at;
        return seg.src_start + (tOut - seg.out_start) * seg.speed;
      }
    }
    return this.segments.length ? this.segments[this.segments.length - 1].src_end : 0;
  }

  /** True if clip time t isn't in the finished video. */
  isCut(t) {
    return !this.segments.some((s) => s.kind === "clip" && s.src_start - 1e-6 <= t && t <= s.src_end + 1e-6);
  }

  /** Finished-video [start, end] for something shown for `length` seconds at clip time `at`. */
  place(at, length) {
    let start;
    if (at === "start") start = 0;
    else if (at === "end") start = Math.max(0, this.duration - length);
    else start = this.toOutput(Number(at));
    start = Math.max(0, Math.min(start, Math.max(0, this.duration - 0.05)));
    return [start, Math.min(this.duration, start + length)];
  }
}

// ------------------------------------------------------------------ describing plans

/** What an overlay picture looks like (captions and stickers are drawn on a canvas). */
export function overlaySpec(kind, item) {
  if (kind === "text") return { kind: "text", text: item.text, size: item.size, color: item.color };
  return { kind: "sticker", emoji: item.emoji, size: item.size };
}

export function overlayKey(kind, item) {
  return stableJson(overlaySpec(kind, item));
}

/** Every caption/sticker picture this plan needs: [{key, spec}]. */
export function overlays(plan) {
  const found = new Map();
  for (const kind of ["text", "sticker"]) {
    for (const item of plan[kind] || []) found.set(overlayKey(kind, item), overlaySpec(kind, item));
  }
  return [...found].map(([key, spec]) => ({ key, spec }));
}

/** The plan as a list of steps for the screen: [{id, icon, text}]. */
export function steps(plan) {
  const out = [];
  const fmt = FORMAT_NAMES[plan.format] + (plan.format !== "original" ? `, ${FIT_NAMES[plan.fit]}` : "");
  out.push({ id: "format", icon: "📱", text: fmt });
  if (plan.keep) out.push({ id: "keep", icon: "✂️", text: `Use ${f1(plan.keep.start)}s – ${f1(plan.keep.end)}s` });
  for (const i of plan.remove) out.push({ id: i.id, icon: "🗑️", text: `Cut out ${f1(i.start)}s – ${f1(i.end)}s` });
  for (const i of plan.speed) {
    const [icon, word] = i.factor < 1 ? ["🐢", "Slow-mo"] : ["⏩", "Speed up"];
    out.push({ id: i.id, icon, text: `${word} ${g(i.factor)}x, ${f1(i.start)}s – ${f1(i.end)}s` });
  }
  for (const i of plan.freeze) {
    out.push({ id: i.id, icon: "🧊", text: `Freeze at ${fmtAt(i.at)} for ${g(i.duration)}s${i.bw ? " (B&W)" : ""}` });
  }
  for (const i of plan.zoom) out.push({ id: i.id, icon: "🔍", text: `Zoom ${g(i.amount)}x at ${fmtAt(i.at)}` });
  for (const i of plan.shake) out.push({ id: i.id, icon: "📳", text: `Shake at ${fmtAt(i.at)}` });
  for (const i of plan.flash) out.push({ id: i.id, icon: "⚡", text: `Flash at ${fmtAt(i.at)}` });
  for (const i of plan.text) out.push({ id: i.id, icon: "💬", text: `“${i.text}” ${i.position}, at ${fmtAt(i.at)}` });
  for (const i of plan.sticker) out.push({ id: i.id, icon: i.emoji, text: `Sticker at ${fmtAt(i.at)}` });
  for (const i of plan.sound) out.push({ id: i.id, icon: "🔊", text: `${i.name} at ${fmtAt(i.at)}` });
  if (plan.music) out.push({ id: "music", icon: "🎵", text: `Music: ${plan.music.name}` });
  if ((plan.color || "none") !== "none") out.push({ id: "color", icon: "🎨", text: `Color: ${plan.color}` });
  if ((plan.game_volume ?? 1.0) !== 1.0) {
    out.push({ id: "game_volume", icon: "🔈", text: `Game sound ${Math.trunc(plan.game_volume * 100)}%` });
  }
  return out;
}

/** The plan in a few lines for the AI to read. */
export function summary(plan) {
  return steps(plan).map((s) => `${s.icon} ${s.text}`).join("\n");
}
