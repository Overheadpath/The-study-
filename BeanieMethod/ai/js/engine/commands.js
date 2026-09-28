/* Instant commands: clear edit requests understood without the AI.
 *
 * "cut out 5 to 7", "add a skull at the end", "slow mo at 6", "boom at 6"...
 * parse() turns a message into plan actions. It's careful: if any part of the
 * message isn't understood, the message goes to the AI instead (with this parse as a hint).
 * When the AI isn't set up yet, whatever was understood is used.
 */

import { escapeRegExp } from "./plan.js";
import { BUILTIN, BUILTIN_NAMES } from "./sfx.js";

const T = String.raw`(\d+:\d{1,2}(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:s\b|secs?\b|seconds?\b)?`;
const SPECIAL_TIMES = {
  "the start": "start", "the beginning": "start", start: "start", beginning: "start",
  "the end": "end", end: "end", "the ending": "end",
};
const HERE_WORDS = ["right here", "here", "right now", "this moment", "this part", "this spot"];
const MOMENT_WORDS = String.raw`\bthe (?:steal|grab|moment|best part|highlight|main moment|fail|hit)\b`;

// Whole emoji, including skin tones, flags and joined emoji like 🏃‍♂️.
const EMOJI_RE = /(?:[\u{1F1E6}-\u{1F1FF}]{2}|[\u{1F300}-\u{1FAFF}☀-➿⭐⭕‼⁉❗❓❤](?:️|[\u{1F3FB}-\u{1F3FF}]|‍[\u{1F300}-\u{1FAFF}☀-➿♀♂]️?)*)/gu;

export const EMOJI_WORDS = [
  ["skull", "💀"], ["skulls", "💀"], ["fire", "🔥"], ["flame", "🔥"], ["laughing", "😂"], ["laughing face", "😂"],
  ["crying", "😭"], ["sob", "😭"], ["money bag", "💰"], ["money", "💰"], ["eyes", "👀"], ["moai", "🗿"],
  ["stone face", "🗿"], ["clown", "🤡"], ["goat", "🐐"], ["sunglasses", "😎"], ["cool face", "😎"], ["devil", "😈"],
  ["trophy", "🏆"], ["crown", "👑"], ["100", "💯"], ["shocked", "😱"], ["scream", "😱"], ["mind blown", "🤯"],
  ["exploding head", "🤯"], ["thumbs up", "👍"], ["nerd", "🤓"], ["raised eyebrow", "🤨"], ["sus", "🤨"],
  ["brain", "🧠"], ["ghost", "👻"], ["rocket", "🚀"], ["star", "⭐"], ["heart", "❤️"], ["angry", "😡"],
  ["zzz", "💤"], ["question mark", "❓"], ["warning", "⚠️"], ["check mark", "✅"], ["cap", "🧢"], ["salute", "🫡"],
  ["pleading", "🥺"], ["party", "🥳"], ["cold face", "🥶"], ["w", "🏆"],
];
const EMOJI_CUE = String.raw`\b(?:add|put|stick|slap|throw|place|drop|show|pop|emoji|sticker)\b`;

const SOUND_WORDS = [
  ["boom", ["vine boom", "boom", "bam"]], ["bass_drop", ["bass drop"]],
  ["hit", ["hit sound", "punch sound", "slap sound", "punch", "slap"]],
  ["whoosh", ["whoosh", "swoosh", "woosh", "swish"]],
  ["riser", ["riser", "build up sound", "buildup sound"]], ["tick", ["ticking", "tick", "clock"]],
  ["alarm", ["alarm", "siren"]], ["ding", ["ding", "bell"]],
  ["cash", ["cha ching", "cha-ching", "ka ching", "ka-ching", "cash register", "cash sound", "cash"]],
  ["pop", ["pop sound", "pop"]], ["fail_horn", ["sad trombone", "fail horn", "wah wah", "trombone", "fail sound"]],
  ["victory", ["victory", "win sound", "tada", "ta-da", "ta da"]], ["heartbeat", ["heartbeat", "heart beat"]],
  ["glitch", ["glitch"]], ["airhorn", ["air horn", "airhorn", "mlg horn"]],
];
const SOUND_CUE = String.raw`\b(?:sound|sfx|noise|play|add|put)\b`;

const SKILL_PATTERNS = [
  ["cut_boring", String.raw`\b(?:cut|remove|delete|skip|get rid of)\b.*\b(?:boring|loading|dead|menu|afk)\b`],
  ["fail_l", String.raw`\b(?:fail|l)\s*(?:edit|version|video|tiktok|clip)\b|\b(?:make|turn)\b.*\b(?:fail|an? l)\b`],
  ["steal_w", String.raw`\b(?:w|win|winning|steal|success|tiktok|full)\s*(?:edit|version)\b`
    + String.raw`|\b(?:make|turn)\b.*\b(?:a w|an edit|a tiktok)\b|\bedit it\b`],
  ["suspense", String.raw`\b(?:suspense|build[- ]?up|dramatic|tension)\b`],
  ["hype", String.raw`\bhype\b|\bmake it (?:epic|lit|crazy)\b`],
  ["clean", String.raw`\b(?:clean|simple|plain)\b.*\b(?:edit|version|vertical|one)\b|\bno effects\b`],
];

const KIND_WORDS = [
  ["zoom", "zoom"], ["zooms", "zoom"], ["sticker", "sticker"], ["stickers", "sticker"], ["emoji", "sticker"],
  ["emojis", "sticker"], ["text", "text"], ["texts", "text"], ["caption", "text"], ["captions", "text"],
  ["title", "text"], ["words", "text"], ["sound", "sound"], ["sounds", "sound"], ["sfx", "sound"],
  ["sound effects", "sound"], ["music", "music"], ["song", "music"], ["slowmo", "speed"], ["speed", "speed"],
  ["freeze", "freeze"], ["freezes", "freeze"], ["flash", "flash"], ["flashes", "flash"], ["shake", "shake"],
  ["shakes", "shake"], ["color", "color"], ["colour", "color"], ["filter", "color"], ["effects", "effects"],
  ["everything", "all"], ["cuts", "remove"], ["trim", "keep"],
];

const QUESTION_START = new RegExp(String.raw`^(?:what|why|how|who|when|where|which|can you|could you|should|is it|`
  + String.raw`do you|does|are you|will|would|help|explain|tell me|idk|i don't know)\b`);
// A separator outside double quotes (so captions can contain commas and "and").
const OUTSIDE_QUOTES = String.raw`(?=(?:[^"]*"[^"]*")*[^"]*$)`;
const SEPARATORS = new RegExp(String.raw`\s*(?:[,;]|\band then\b|\bthen\b|\balso\b|\band\b|\bplus\b)\s*` + OUTSIDE_QUOTES);

const re = (pattern, flags = "") => new RegExp(pattern, flags);
const has = (pattern, text) => re(pattern).test(text);
const word = (w) => String.raw`\b${escapeRegExp(w)}\b`;
const byLongest = (pairs) => pairs.map((p, i) => [p, i])
  .sort((a, b) => b[0][0].length - a[0][0].length || a[1] - b[1]).map(([p]) => p);

export class Parsed {
  constructor() {
    this.actions = [];
    this.special = null;      // "undo" or "redo"
    this.confident = false;   // true if every part of the message was understood
  }
}

function normalize(text) {
  text = text.replace(/’/g, "'").replace(/‘/g, "'").replace(/“/g, '"').replace(/”/g, '"');
  text = text.replace(/\bblack\s*(?:and|&|n)\s*white\b|\bb\s*&\s*w\b|\bb\/w\b/gi, "bw");
  text = text.replace(/\bslow[\s-]*mo(?:tion)?\b/gi, "slowmo");
  text = text.replace(/\bzoom\s*in\b/gi, "zoom");
  text = text.replace(re(String.raw`\bbetween\s+${T}\s+and\s+${T}`, "gi"), "from $1 to $2");
  return text.trim();
}

function timeValue(raw) {
  raw = raw.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(SPECIAL_TIMES, raw)) return SPECIAL_TIMES[raw];
  const m = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(raw);
  if (m) return parseInt(m[1], 10) * 60 + parseFloat(m[2]);
  const v = raw === "" ? NaN : Number(raw);
  return Number.isFinite(v) ? v : null;
}

function markerTime(clause, ctx) {
  const markers = ctx.markers || [];
  for (const mk of markers) {
    const label = String(mk.label ?? "").toLowerCase().trim();
    if (label && has(word(label), clause)) return Number(mk.t);
  }
  if (has(MOMENT_WORDS, clause)) {
    if (markers.length) return Number(markers[markers.length - 1].t);
    if (ctx.highlight !== null && ctx.highlight !== undefined) return Number(ctx.highlight);
  }
  return null;
}

/** start / end / at / duration found in one part of a message. */
function times(clause, ctx) {
  const found = {};
  let m = re(String.raw`(?:from\s+)?${T}\s*(?:-|–|to|until|till|through)\s*(?:${T}|(the end|end))`).exec(clause);
  if (m) {
    found.start = timeValue(m[1]);
    found.end = timeValue(m[2] || m[3]);
  }
  m = /\b(?:at|@|around|on|in)\s+(the (?:very )?(?:start|beginning|end|ending))\b/.exec(clause);
  if (m) {
    found.at = SPECIAL_TIMES[m[1].replace("very ", "")] ?? null;
  } else if (/\bto the end\b|\bat the finish\b/.test(clause) && !("start" in found)) {
    found.at = "end";
  }
  m = re(String.raw`\b(?:at|@|around|on)\s+${T}`).exec(clause);
  if (m && !("at" in found)) found.at = timeValue(m[1]);
  if (!("at" in found) && ctx.now !== null && ctx.now !== undefined) {
    if (HERE_WORDS.some((w) => has(String.raw`\b${w}\b`, clause))) found.at = Number(ctx.now);
  }
  if (!("at" in found)) {
    const marker = markerTime(clause, ctx);
    if (marker !== null) found.at = marker;
    else if (has(MOMENT_WORDS, clause)) found.unknown_moment = true;
  }
  m = re(String.raw`\bfor\s+${T}`).exec(clause);
  if (m) found.duration = timeValue(m[1]);
  const out = {};
  for (const [k, v] of Object.entries(found)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

function factor(clause, dflt) {
  const m = /(\d+(?:\.\d+)?)\s*(?:x|times)\b/.exec(clause);
  if (m) return parseFloat(m[1]);
  for (const [w, value] of [["quarter speed", 0.25], ["half speed", 0.5], ["double speed", 2.0],
    ["super slow", 0.25], ["really slow", 0.3], ["very slow", 0.3]]) {
    if (clause.includes(w)) return value;
  }
  return dflt;
}

function position(clause) {
  for (const [w, pos] of [["top", "top"], ["bottom", "bottom"], ["middle", "middle"], ["center", "middle"],
    ["centre", "middle"]]) {
    if (has(String.raw`\b${w}\b`, clause)) return pos;
  }
  return null;
}

function size(clause) {
  for (const [w, s] of [["huge", "big"], ["giant", "big"], ["big", "big"], ["large", "big"], ["small", "small"],
    ["tiny", "small"], ["little", "small"], ["medium", "medium"]]) {
    if (has(String.raw`\b${w}\b`, clause)) return s;
  }
  return null;
}

function soundNames(clause, ctx) {
  const available = new Set(ctx.sounds && ctx.sounds.length ? ctx.sounds : BUILTIN_NAMES);
  const names = [];
  let rest = clause;
  const mine = [...available].filter((n) => !BUILTIN[n]).sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  for (const name of mine) {
    const spoken = name.replace(/_/g, " ");
    if (has(word(spoken), rest)) {
      names.push(name);
      rest = rest.replace(re(word(spoken), "g"), " ");
    }
  }
  for (const [name, words] of SOUND_WORDS) {
    for (const w of words) {
      if (has(word(w), rest)) {
        if (available.has(name) && !names.includes(name)) names.push(name);
        rest = rest.replace(re(word(w), "g"), " ");
        break;
      }
    }
  }
  return names;
}

/** Emoji in a clause: real emoji always; emoji names ("skull") only with a cue like "add". */
function emojis(clause, needCue = true) {
  const found = clause.match(EMOJI_RE) || [];
  let lowered = clause.toLowerCase();
  if (!needCue || has(EMOJI_CUE, lowered)) {
    for (const [w, emoji] of byLongest(EMOJI_WORDS)) {
      if (w === "w") continue;
      if (has(word(w), lowered)) {
        found.push(emoji);
        lowered = lowered.replace(re(word(w), "g"), " ");
      }
    }
  }
  return found;
}

function withLook(act, clause, t) {
  if (t.duration) act.duration = t.duration;
  const pos = position(clause);
  if (pos) act.position = pos;
  const s = size(clause);
  if (s) act.size = s;
  return act;
}

/** Actions for one part of a message ([] if it wasn't understood). */
function parseClause(raw, ctx, parsed) {
  const quoted = [...raw.matchAll(/"([^"]{1,80})"/g)].map((m) => m[1]);
  const outside = raw.replace(/"[^"]*"/g, " ");
  let clause = outside.toLowerCase().replace(/\s+/g, " ").trim().replace(/^[ .!]+|[ .!]+$/g, "");
  clause = clause.replace(/^(?:please|pls|plz|ok|okay|yo|bro|now|and|also|then)\s+/, "");
  if (!clause && !quoted.length) return [];
  const t = times(clause, ctx);

  if (/^(?:undo|go back|take (?:that|it) back|undo (?:that|it)|back)$/.test(clause)) {
    parsed.special = "undo";
    return ["undo"];
  }
  if (/^(?:redo|redo (?:that|it)|put it back)$/.test(clause)) {
    parsed.special = "redo";
    return ["redo"];
  }
  if (/\b(?:start over|reset|clear (?:everything|all|it)|remove everything|delete everything)\b/.test(clause)) {
    return [{ do: "clear" }];
  }

  for (const [skill, pattern] of SKILL_PATTERNS) {
    if (has(pattern, clause)) {
      const act = { do: "apply_skill", skill };
      if ("at" in t) act.at = t.at;
      else if (t.unknown_moment && skill !== "cut_boring" && skill !== "clean") act.at = "highlight";
      return [act];
    }
  }

  // "cut the first 3 seconds" / "cut the last 2 seconds"
  let m = re(String.raw`\b(?:cut|trim|remove|skip|delete)\s+(?:off\s+)?the first\s+${T}`).exec(clause);
  if (m) return [{ do: "keep", start: timeValue(m[1]), end: "end" }];
  m = re(String.raw`\b(?:cut|trim|remove|skip|delete)\s+(?:off\s+)?the last\s+${T}`).exec(clause);
  if (m) {
    const last = timeValue(m[1]);
    return [{ do: "keep", start: "start", end: Math.max(0, (ctx.duration || 0) - last) }];
  }

  // removing things: "remove the zoom", "no music", "delete the boom"
  const del = /^(?:remove|delete|get rid of|take off|take out|lose|no more|no)\s+(?:the\s+|all\s+(?:the\s+)?|that\s+|those\s+)?(.+)$/.exec(clause);
  if (del && !("start" in t)) {
    const target = del[1].trim();
    const sounds = soundNames(target, ctx);
    const emo = emojis(target, false);
    let kind = null;
    for (const [w, k] of byLongest(KIND_WORDS)) {
      if (has(word(w), target)) {
        kind = k;
        break;
      }
    }
    if (kind === "music") return [{ do: "music", name: "none" }];
    if (kind === "all" || kind === "effects") return [{ do: "delete", what: kind }];
    if (kind === "color") return [{ do: "color", style: "none" }];
    if (sounds.length && (kind === null || kind === "sound")) return sounds.map((s) => ({ do: "delete", what: "sound", name: s }));
    if (emo.length && (kind === null || kind === "sticker")) return emo.map((e) => ({ do: "delete", what: "sticker", name: e }));
    if (quoted.length && (kind === null || kind === "text")) return quoted.map((q) => ({ do: "delete", what: "text", name: q }));
    if (kind) {
      const act = { do: "delete", what: kind };
      if (typeof t.at === "number") act.at = t.at;
      return [act];
    }
  }

  // ranges: "cut out 5 to 7" removes, "trim 3 to 12" / "keep 3-12" keeps
  const hasRange = "start" in t && "end" in t;
  if (hasRange && /\b(?:cut|remove|delete|skip|chop)\b/.test(clause) && !/\b(?:keep|trim|only|use)\b/.test(clause)) {
    return [{ do: "remove", start: t.start, end: t.end }];
  }
  if (hasRange && /\b(?:trim|keep|use|only)\b/.test(clause)) return [{ do: "keep", start: t.start, end: t.end }];
  m = re(String.raw`\b(?:start|begin)\s+(?:it\s+|the video\s+|the clip\s+)?(?:at|from)\s+${T}`).exec(clause);
  if (m) return [{ do: "keep", start: timeValue(m[1]), end: "end" }];
  m = re(String.raw`\b(?:end|stop|finish)\s+(?:it\s+|the video\s+|the clip\s+)?(?:at|by)\s+${T}`).exec(clause);
  if (m) return [{ do: "keep", start: "start", end: timeValue(m[1]) }];

  const acts = [];
  if (/\b(?:vertical|tiktok|shorts|reels|9:16|portrait|phone)\b/.test(clause)) {
    const fit = /\b(?:crop|fill|zoomed)\b/.test(clause) ? "crop" : (/\bbars?\b|\bletterbox/.test(clause) ? "bars" : "blur");
    acts.push({ do: "format", format: "vertical", fit });
  } else if (/\bsquare\b|\b1:1\b/.test(clause)) {
    acts.push({ do: "format", format: "square" });
  } else if (/\b(?:landscape|original (?:size|shape)|widescreen|16:9|youtube)\b/.test(clause)) {
    acts.push({ do: "format", format: "original" });
  } else if (/\bblack bars\b|\bletterbox/.test(clause)) {
    acts.push({ do: "format", fit: "bars" });
  } else if (/\bblur(?:red)? background\b/.test(clause)) {
    acts.push({ do: "format", fit: "blur" });
  } else if (/^(?:make it )?crop(?: it)?(?: to fill)?$/.test(clause)) {
    acts.push({ do: "format", fit: "crop" });
  }

  if (/\bslowmo\b|\bslow (?:it )?down\b/.test(clause)) {
    const f = Math.min(0.9, factor(clause, 0.5));
    if (hasRange) {
      acts.push({ do: "speed", start: t.start, end: t.end, factor: f });
    } else if (typeof t.at === "number") {
      const half = (t.duration || 1.2) / 2;
      acts.push({ do: "speed", start: Math.max(0, t.at - half), end: t.at + half, factor: f });
    } else if (t.unknown_moment) {
      return [];
    } else {
      acts.push({ do: "apply_skill", skill: "slowmo" });
    }
  } else if (/\bspeed (?:it )?up\b|\bfast[- ]?forward\b|\bfaster\b/.test(clause)) {
    if (!hasRange) return [];
    acts.push({ do: "speed", start: t.start, end: t.end, factor: Math.max(1.1, factor(clause, 2.0)) });
  }

  const needsTime = t.unknown_moment || !("at" in t);
  if (/\bfreeze\b/.test(clause)) {
    if (t.unknown_moment) return [];
    const act = { do: "freeze", at: "at" in t ? t.at : "end", duration: "duration" in t ? t.duration : 1.5 };
    if (/\bbw\b|\bgr[ae]y\b/.test(clause)) act.bw = true;
    acts.push(act);
  } else if (/\bbw\b/.test(clause)) {
    acts.push({ do: "color", style: "bw" });
  }

  if (/\bzoom\b/.test(clause)) {
    if (needsTime) return [];
    const act = { do: "zoom", at: t.at, duration: "duration" in t ? t.duration : 1.2 };
    const amount = factor(clause, null);
    if (amount) act.amount = amount;
    for (const [w, x] of [["left", 0.2], ["right", 0.8]]) if (has(String.raw`\b${w}\b`, clause)) act.x = x;
    for (const [w, y] of [["top", 0.25], ["bottom", 0.75]]) if (has(String.raw`\b${w}\b`, clause)) act.y = y;
    acts.push(act);
  }
  if (/\bshake\b/.test(clause)) {
    if (needsTime) return [];
    acts.push({ do: "shake", at: t.at, duration: "duration" in t ? t.duration : 0.5 });
  }
  if (/\bflash\b/.test(clause)) {
    if (needsTime) return [];
    acts.push({ do: "flash", at: t.at });
  }

  for (const [style, pattern] of [["vibrant", /\b(?:vibrant|colou?rful|saturated|brighter colou?rs?)\b/],
    ["cinematic", /\b(?:cinematic|movie look|film look)\b/],
    ["warm", /\bwarm(?:er)? (?:colou?rs?|look|filter)\b/],
    ["cold", /\b(?:cold|cool) (?:colou?rs?|look|filter)\b/],
    ["retro", /\b(?:retro|vintage|old school)\b/],
    ["none", /\b(?:normal|no) (?:colou?rs?|filter)\b/]]) {
    if (pattern.test(clause)) {
      acts.push({ do: "color", style });
      break;
    }
  }

  if (/\bmute\b/.test(clause) && !/\bmusic\b/.test(clause)) acts.push({ do: "volume", value: 0 });
  m = /\b(?:game|video)\s+(?:sound|audio|volume)\s+(?:to\s+|at\s+)?(\d+)\s*%/.exec(clause);
  if (m) acts.push({ do: "volume", value: parseInt(m[1], 10) / 100 });

  if (/\b(?:stop|turn off)\s+(?:the\s+)?music\b|\bmusic off\b/.test(clause)) {
    acts.push({ do: "music", name: "none" });
  } else {
    m = /\b(?:add|play|use|put)\s+(?:the\s+|my\s+)?(?:song|music)\s+(.+?)(?:\s+(?:at|on)\s+.*)?$/.exec(clause);
    if (m) acts.push({ do: "music", name: m[1].trim() });
  }

  for (const words of quoted) {
    acts.push(withLook({ do: "text", text: words, at: "at" in t ? t.at : "start" }, clause, t));
  }
  // Emoji names count without "add"/"put" only in short commands with a time: "skull at 5".
  const shortWithTime = clause.split(" ").filter(Boolean).length <= 4 && "at" in t;
  for (const emoji of emojis(outside, !shortWithTime)) {
    if (t.unknown_moment) return [];
    acts.push(withLook({ do: "sticker", emoji, at: "at" in t ? t.at : "end" }, clause, t));
  }

  const sounds = soundNames(clause, ctx);
  if (sounds.length && (has(SOUND_CUE, clause) || clause.split(" ").filter(Boolean).length <= 5)) {
    if (!("at" in t)) return [];
    for (const name of sounds) acts.push({ do: "sound", name, at: t.at });
  }
  return acts;
}

/** Understand a chat message as edit commands when it clearly is one. */
export function parse(message, ctx) {
  const parsed = new Parsed();
  const text = normalize(message || "");
  if (!text || text.length > 400) return parsed;
  const isQuestion = text.includes("?") || QUESTION_START.test(text.toLowerCase());
  const parts = text.split(SEPARATORS).map((p) => p.replace(/^[ .!]+|[ .!]+$/g, "")).filter(Boolean);
  let understood = 0;
  for (const part of parts) {
    const acts = parseClause(part, ctx, parsed);
    if (acts.length) {
      understood += 1;
      parsed.actions.push(...acts.filter((a) => typeof a === "object"));
    }
  }
  const words = (text.match(/[\p{L}\p{N}_]+/gu) || []).length;
  parsed.confident = understood === parts.length && understood > 0 && !isQuestion && words <= 30;
  return parsed;
}
