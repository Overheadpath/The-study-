/* The AI brain. Two kinds, both running on the user's own PC:
 *
 *  - Chrome's built-in AI (Gemini Nano, the Prompt API). Nothing to install.
 *  - Ollama (https://ollama.com) with a model like gemma3:4b.
 *
 * The model answers in a fixed JSON shape ({"reply": ..., "actions": [...]}) that both
 * enforce, so its edits can always be read. The reply text streams out while it's written.
 */

import * as P from "./plan.js";
import { SKILLS, playbookText } from "./skills.js";

export class BrainOffline extends Error {}  // the AI isn't running / isn't installed
export class BrainError extends Error {}

const VISION_NAMES = ["gemma3", "llava", "vision", "qwen2.5vl", "qwen2.5-vl", "minicpm-v", "moondream", "llama4",
  "mistral-small3.1", "mistral-small3.2", "gemma3n", "bakllava"];

export const RECOMMENDED_MODELS = [
  { name: "gemma3:4b", size: "3.3 GB", note: "Best for most PCs. Smart, fast, and can watch your clips." },
  { name: "gemma3:1b", size: "0.8 GB", note: "For older or slower PCs. Can't watch clips." },
  { name: "qwen2.5:7b", size: "4.7 GB", note: "Great at following edit requests. Needs a strong PC." },
  { name: "gemma3:12b", size: "8.1 GB", note: "Smartest. Needs a gaming GPU with 12 GB+." },
];

// ------------------------------------------------------------------ the answer shape

const TIME = { anyOf: [{ type: "number" }, { type: "string" }] };

export const ACTION_SCHEMA = {
  type: "object",
  properties: {
    do: { type: "string", enum: [...P.ACTIONS] },
    skill: { type: "string", enum: Object.keys(SKILLS) },
    at: TIME, start: TIME, end: TIME,
    duration: { type: "number" }, factor: { type: "number" }, amount: { type: "number" },
    x: { type: "number" }, y: { type: "number" }, strength: { type: "number" },
    bw: { type: "boolean" }, text: { type: "string" }, emoji: { type: "string" },
    name: { type: "string" },
    position: { type: "string", enum: [...P.POSITIONS] },
    size: { type: "string", enum: [...P.SIZES] },
    color: { type: "string", enum: [...P.TEXT_COLORS] },
    format: { type: "string", enum: [...P.FORMATS] },
    fit: { type: "string", enum: [...P.FITS] },
    style: { type: "string", enum: [...P.COLORS] },
    value: { type: "number" }, what: { type: "string" },
  },
  required: ["do"],
};

export const ANSWER_SCHEMA = {
  type: "object",
  properties: { reply: { type: "string" }, actions: { type: "array", items: ACTION_SCHEMA } },
  required: ["reply", "actions"],
};

/** The same shape without anyOf, for AI engines that can't handle it. */
export function simpleSchema(schema = ANSWER_SCHEMA) {
  return JSON.parse(JSON.stringify(schema, (key, value) => (
    value && typeof value === "object" && Array.isArray(value.anyOf) ? { type: "string" } : value)));
}

export const WATCH_TAGS = ["loading", "menu", "walking", "stealing", "carrying", "hit", "locked", "fail", "win", "other"];

export const WATCH_SCHEMA = {
  type: "object",
  properties: { what: { type: "string" }, tag: { type: "string", enum: WATCH_TAGS } },
  required: ["what", "tag"],
};

const SYSTEM_PROMPT = `You are Beanie, a friendly AI video editor inside Beanie Pro, running on the user's own PC.
You edit Roblox "steal" clips (Steal a Brainrot and games like it, played with the Beanie Pro method)
into short vertical videos for TikTok and YouTube Shorts. You can also just chat.

How you talk: short (1-3 sentences), hype, friendly, fun. No swearing. Reply in the user's language.

How you edit: you return actions. The editor applies them and the preview updates.
Times are seconds in the ORIGINAL clip, or "start" / "end". Use the clip notes and the user's
markers to find the moments. Only change what the user asked for; the current edit is kept.

What makes a great Beanie steal edit:
- Hook in the first second: cut loading screens, menus and walking around.
- Short: 8-25 seconds.
- Build to the steal: slow-mo or a zoom right before the grab, then boom + flash on the grab.
- End on the payoff. W (clean steal): 🔥 😈 🏆 + victory or cash sound.
  L (base locked, got hit, got caught): freeze + 💀 + boom + a funny caption.
- 9:16 vertical with a blurred background so nothing is cut off.
- Captions: max 5 words, ALL CAPS or funny lowercase, at the top.
- Don't overdo it: 1-3 zooms, 1-2 stickers, 2-4 sounds.

Skills (a whole edit in one action - use them for "make an edit", "W edit", "fail edit" and so on):
{skills}

Actions (leave out fields you don't need):
{"do":"apply_skill","skill":"steal_w","at":12.4}
{"do":"keep","start":2,"end":15}  use only this part of the clip
{"do":"remove","start":5,"end":7}  cut a part out
{"do":"speed","start":5,"end":6,"factor":0.5}  factor below 1 = slow-mo, above 1 = faster
{"do":"freeze","at":6,"duration":1.5,"bw":true}
{"do":"zoom","at":6,"duration":1.2,"amount":1.4,"x":0.5,"y":0.5}  x/y: where to zoom, 0 to 1
{"do":"shake","at":6,"duration":0.5}
{"do":"flash","at":6}
{"do":"text","text":"EZ STEAL 😈","at":"start","duration":2.5,"position":"top"}
{"do":"sticker","emoji":"💀","at":"end","duration":1.5,"position":"middle","size":"big"}
{"do":"sound","name":"boom","at":6}
{"do":"music","name":"song name"}  or "name":"none"
{"do":"format","format":"vertical","fit":"blur"}  format: vertical, original, square. fit: blur, crop, bars
{"do":"color","style":"vibrant"}  none, vibrant, cinematic, bw, warm, cold, retro
{"do":"volume","value":0.5}  how loud the game sound is (1 = normal)
{"do":"delete","what":"zoom"}  what: zoom, sticker, text, sound, speed, freeze, flash, shake, remove, effects, all.
   Add "at" or "name" to delete just one.
{"do":"clear"}  start over

Sound effects you can use (never make up other names):
{sounds}

Rules:
- If the user only chats or asks something, answer and return "actions": [].
- If you need a moment you don't know (like when the steal happens), use the clip notes, or ask the
  user to pause the video at the moment and press "Mark".
- Say what you changed in the reply, in plain words.

Examples:
User: make it a W edit
{"reply":"W edit coming up! Slow-mo and a boom on the grab, victory sound at the end 🔥","actions":[{"do":"apply_skill","skill":"steal_w","at":12.4}]}
User: add a skull when I get hit and make it black and white there
{"reply":"Freezing it in black and white with a big 💀 at 8.2s. Brutal.","actions":[{"do":"freeze","at":8.2,"duration":1.5,"bw":true},{"do":"sticker","emoji":"💀","at":8.2,"duration":1.5,"position":"middle","size":"big"},{"do":"sound","name":"boom","at":8.2}]}
User: what's a good caption?
{"reply":"Try \\"THEY DIDN'T SEE IT 👀\\" at the top - want me to add it?","actions":[]}
`;

export function systemPrompt(soundCatalog) {
  const sounds = Object.keys(soundCatalog).sort().map((name) => `- ${name}: ${soundCatalog[name]}`).join("\n");
  return SYSTEM_PROMPT.replace("{skills}", playbookText()).replace("{sounds}", sounds);
}

export function contextBlock(clipNotes, planSummary, guess = null, songs = null) {
  const parts = ["[Clip notes]", clipNotes, "", "[Current edit]", planSummary || "(nothing yet)"];
  if (songs && songs.length) parts.push("", "[Songs in My Music]", songs.join(", "));
  if (guess && guess.length) {
    parts.push("", "[What the quick parser understood - use it if it's right]", JSON.stringify(guess));
  }
  return parts.join("\n");
}

// ------------------------------------------------------------------ streaming the reply out

const SIMPLE_ESCAPES = { '"': '"', "\\": "\\", "/": "/", n: "\n", t: "\t", r: "", b: "", f: "" };
const HEX4 = /^[0-9a-fA-F]{4}$/;

/** Pulls the "reply" text out of the JSON answer while it's still being written. */
export class ReplyStream {
  constructor() {
    this.buf = "";
    this.pos = null;
    this.text = "";
    this.finished = false;
  }

  /** Add answer text; returns any new reply text. */
  feed(piece) {
    this.buf += piece;
    if (this.finished) return "";
    if (this.pos === null) {
      const m = /"reply"\s*:\s*"/.exec(this.buf);
      if (!m) return "";
      this.pos = m.index + m[0].length;
    }
    const buf = this.buf;
    let out = "";
    let i = this.pos;
    while (i < buf.length) {
      const c = buf[i];
      if (c === '"') {
        this.finished = true;
        i += 1;
        break;
      }
      if (c !== "\\") {
        out += c;
        i += 1;
        continue;
      }
      if (i + 1 >= buf.length) break;
      const next = buf[i + 1];
      if (next in SIMPLE_ESCAPES) {
        out += SIMPLE_ESCAPES[next];
        i += 2;
        continue;
      }
      if (next === "u") {
        if (i + 6 > buf.length) break;
        const hex = buf.slice(i + 2, i + 6);
        let code = HEX4.test(hex) ? parseInt(hex, 16) : 63;
        if (code >= 0xd800 && code < 0xdc00) {
          if (i + 12 > buf.length) break;
          const low = buf.slice(i + 6, i + 8) === "\\u" ? buf.slice(i + 8, i + 12) : "";
          if (HEX4.test(low)) {
            code = 0x10000 + ((code - 0xd800) << 10) + (parseInt(low, 16) - 0xdc00);
            out += String.fromCodePoint(code);
            i += 12;
            continue;
          }
        }
        out += String.fromCharCode(code);
        i += 6;
        continue;
      }
      out += next;
      i += 2;
    }
    this.pos = i;
    this.text += out;
    return out;
  }
}

/** {reply, actions, complete} from the model's full answer, even if it was cut off. */
export function parseAnswer(text, fallbackReply = "") {
  text = text.trim();
  const candidates = [text];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start > 0 && end > start) candidates.push(text.slice(start, end + 1));  // JSON inside other text
  for (const candidate of candidates) {
    let data;
    try {
      data = JSON.parse(candidate);
    } catch (e) {
      continue;
    }
    if (data && typeof data === "object" && !Array.isArray(data) && ("reply" in data || "actions" in data)) {
      const reply = String(data.reply || fallbackReply).trim();
      const actions = Array.isArray(data.actions) ? data.actions : [];
      return { reply, actions: actions.filter((a) => a && typeof a === "object" && !Array.isArray(a)), complete: true };
    }
  }
  if (!fallbackReply && !text.startsWith("{")) {
    // Plain words instead of JSON: show them as the reply.
    return { reply: text.slice(0, 1500), actions: [], complete: false };
  }
  const actions = [];
  const m = /"actions"\s*:\s*(\[[\s\S]*)/.exec(text);
  if (m) {
    const body = m[1];
    let depth = 0;
    let from = null;
    let inString = false;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (inString) {
        if (c === "\\") i += 1;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{") {
        if (depth === 0) from = i;
        depth += 1;
      } else if (c === "}") {
        depth -= 1;
        if (depth === 0 && from !== null) {
          try {
            actions.push(JSON.parse(body.slice(from, i + 1)));
          } catch (e) { /* a broken action: skip it */ }
          from = null;
        }
      }
    }
  }
  return { reply: fallbackReply.trim(), actions, complete: false };
}

/** The steal (or fail) moment the model saw, if any: [t, kind] or [null, null]. */
export function momentFromVision(seen) {
  for (const tag of ["stealing", "carrying", "win"]) {
    const s = seen.find((x) => x.tag === tag);
    if (s) return [s.t, "steal"];
  }
  for (const tag of ["locked", "hit", "fail"]) {
    const s = seen.find((x) => x.tag === tag);
    if (s) return [s.t, "fail"];
  }
  return [null, null];
}

export const WATCH_PROMPT = (t) => `This is a frame at ${t.toFixed(1)}s from a Roblox steal game clip (like Steal a Brainrot). `
  + "In under 12 words, what is happening? For example: loading screen, menu, walking, "
  + "grabbing a brainrot, carrying it home, getting hit, base locked with red lasers, "
  + "home screen, celebrating.";

// ------------------------------------------------------------------ Ollama

async function* ndjson(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) yield line;
    }
  }
  if (buf.trim()) yield buf.trim();
}

export class OllamaClient {
  constructor(base, fetchImpl = null) {
    this.base = String(base || "http://127.0.0.1:11434").replace(/\/+$/, "");
    this.fetch = fetchImpl || ((...args) => fetch(...args));
  }

  async request(path, body = null, { timeout = 10000, signal = null } = {}) {
    const ctrl = new AbortController();
    const timer = timeout ? setTimeout(() => ctrl.abort(new BrainOffline("timeout")), timeout) : null;
    if (signal) {
      if (signal.aborted) ctrl.abort(signal.reason);
      else signal.addEventListener("abort", () => ctrl.abort(signal.reason), { once: true });
    }
    let response;
    try {
      response = await this.fetch(this.base + path, {
        method: body === null ? "GET" : "POST",
        headers: body === null ? {} : { "Content-Type": "application/json" },
        body: body === null ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
        cache: "no-store",
      });
    } catch (e) {
      if (signal && signal.aborted) throw e;
      throw new BrainOffline(`Ollama isn't running at ${this.base}.`);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.json()).error || "";
      } catch (e) { /* not JSON */ }
      if (response.status === 404 && /not found/i.test(detail)) {
        throw new BrainError(`The AI model isn't downloaded yet (${detail}).`);
      }
      if (response.status === 403) {
        throw new BrainError("Ollama blocked Beanie Pro (error 403). Open chrome://extensions and press ↻ on "
          + "Beanie Pro, then try again.");
      }
      throw new BrainError(detail || `Ollama answered with error ${response.status}.`);
    }
    return response;
  }

  async json(path, body = null, opts = {}) {
    const response = await this.request(path, body, opts);
    return response.json();
  }

  async* stream(path, body, opts = {}) {
    const response = await this.request(path, body, { timeout: 0, ...opts });
    for await (const line of ndjson(response)) {
      let chunk;
      try {
        chunk = JSON.parse(line);
      } catch (e) {
        continue;
      }
      if (chunk.error) throw new BrainError(chunk.error);
      yield chunk;
    }
  }

  async version() {
    return (await this.json("/api/version", null, { timeout: 3000 })).version || "?";
  }

  async models() {
    const data = await this.json("/api/tags", null, { timeout: 5000 });
    return (data.models || []).map((m) => m.name || m.model);
  }

  /** True if the model can look at pictures. */
  async canSee(model) {
    try {
      const info = await this.json("/api/show", { model }, { timeout: 10000 });
      if (Array.isArray(info.capabilities)) return info.capabilities.includes("vision");
    } catch (e) { /* fall back to the name */ }
    const name = model.toLowerCase();
    return VISION_NAMES.some((v) => name.includes(v)) && !name.includes("gemma3:1b");
  }

  /** Download a model. Yields {status, completed, total} as it goes. */
  pull(model, signal = null) {
    return this.stream("/api/pull", { model, stream: true }, { signal });
  }

  /** Stream a chat answer. Yields pieces of the answer's text. */
  async* chat(model, messages, { schema = null, options = null, signal = null } = {}) {
    const body = {
      model, messages, stream: true, keep_alive: "30m",
      options: { temperature: 0.4, num_ctx: 6144, num_predict: 900, ...(options || {}) },
    };
    if (schema) body.format = schema;
    for await (const chunk of this.stream("/api/chat", body, { signal })) {
      const piece = (chunk.message && chunk.message.content) || "";
      if (piece) yield piece;
      if (chunk.done) break;
    }
  }
}

// ------------------------------------------------------------------ Chrome's built-in AI

const LANG = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };
const LANG_IMAGE = { expectedInputs: [{ type: "text", languages: ["en"] }, { type: "image" }],
  expectedOutputs: [{ type: "text", languages: ["en"] }] };

export class ChromeAI {
  constructor(api = globalThis.LanguageModel) {
    this.api = api;
    this.base = null;       // a session that has read the instructions; cloned for each question
    this.baseKey = null;
    this.schemaMode = 0;    // 0 = full schema, 1 = simpler schema, 2 = no schema
  }

  get present() {
    return Boolean(this.api && typeof this.api.availability === "function");
  }

  /** "available", "downloadable", "downloading", "unavailable" or "missing" (this Chrome has no built-in AI). */
  async availability(image = false) {
    if (!this.present) return "missing";
    try {
      return await this.api.availability(image ? LANG_IMAGE : LANG);
    } catch (e) {
      return "unavailable";
    }
  }

  async create(extra = {}, onProgress = null) {
    const monitor = onProgress ? (m) => m.addEventListener("downloadprogress", (e) => onProgress(e.loaded)) : undefined;
    const opts = { ...LANG, ...extra, monitor };
    try {
      return await this.api.create({ ...opts, temperature: 0.4, topK: 3 });
    } catch (e) {
      if (e && (e.name === "NotAllowedError" || e.name === "AbortError")) throw e;
      return this.api.create(opts);  // this Chrome doesn't take temperature/topK
    }
  }

  /** Download the model (must come from a click). */
  async download(onProgress) {
    const s = await this.create({}, onProgress);
    s.destroy();
  }

  async session(system) {
    if (!this.base || this.baseKey !== system) {
      if (this.base) this.base.destroy();
      this.base = null;
      try {
        this.base = await this.create({ initialPrompts: [{ role: "system", content: system }] });
      } catch (e) {
        if (!e || e.name !== "QuotaExceededError") throw e;
        // a small model: the instructions without the examples and long descriptions
        this.base = await this.create({ initialPrompts: [{ role: "system", content: compactPrompt(system) }] });
      }
      this.baseKey = system;
    }
    return this.base.clone ? this.base.clone() : this.create({ initialPrompts: [{ role: "system", content: system }] });
  }

  /** Stream an answer to one question. Yields pieces of the answer's text. */
  async* chat(system, text, { schema = null, signal = null } = {}) {
    for (;;) {
      const session = await this.session(system);
      const opts = { signal: signal || undefined };
      if (schema && this.schemaMode < 2) {
        opts.responseConstraint = this.schemaMode === 0 ? schema : simpleSchema(schema);
        opts.omitResponseConstraintInput = true;
      }
      let sent = "";
      let started = false;
      try {
        const stream = session.promptStreaming(text, opts);
        for await (const chunk of stream) {
          started = true;
          // Older Chrome versions send the whole answer so far each time; newer ones send new text.
          const piece = sent && chunk.startsWith(sent) ? chunk.slice(sent.length) : chunk;
          sent += piece;
          if (piece) yield piece;
        }
        return;
      } catch (e) {
        if (!started && schema && this.schemaMode < 2 && e && e.name === "NotSupportedError") {
          this.schemaMode += 1;  // try again with a simpler answer shape
          continue;
        }
        throw e;
      } finally {
        session.destroy();
      }
    }
  }

  /** Describe one picture (a Blob or ImageBitmap). */
  async look(prompt, image, signal = null) {
    const s = await this.create(LANG_IMAGE);
    try {
      const answer = await s.prompt([{ role: "user", content: [{ type: "text", value: prompt }, { type: "image", value: image }] }],
        { responseConstraint: WATCH_SCHEMA, signal: signal || undefined });
      return answer;
    } finally {
      s.destroy();
    }
  }
}

// ------------------------------------------------------------------ the brain

/** The instructions for a small model: no examples, short descriptions. */
export function compactPrompt(system) {
  return system.split("\nExamples:\n")[0].replace(/^(- [\w]+: )(.{0,48}).*$/gm, "$1$2").trim();
}

export function historyText(history) {
  if (!history.length) return "";
  const lines = history.map((m) => `${m.role === "user" ? "User" : "Beanie"}: ${m.content}`);
  return `[Earlier in this chat]\n${lines.join("\n")}\n\n`;
}

export class Brain {
  /** settings: {brain: "auto"|"chrome"|"ollama"|"basic", ollama_url, model} */
  constructor(settings, { chromeAI = null, fetchImpl = null } = {}) {
    this.settings = settings;
    this.chromeAI = chromeAI || new ChromeAI();
    this.fetchImpl = fetchImpl;
    this.last = null;
    this.lastTime = 0;
  }

  get ollama() {
    return new OllamaClient(this.settings.ollama_url, this.fetchImpl);
  }

  forget() {
    this.last = null;
  }

  /** What the setup screen shows. Cached for a few seconds. */
  async status(fresh = false) {
    if (!fresh && this.last && Date.now() - this.lastTime < 4000) return this.last;
    const choice = this.settings.brain || "auto";
    const out = {
      choice, mode: "basic", ready: false, vision: false, label: "Basic mode",
      chrome: { availability: "missing", vision: false },
      ollama: { online: false, version: null, models: [], model: this.settings.model, ready: false, vision: false },
    };
    const [chromeState, ollamaState] = await Promise.all([
      choice === "ollama" || choice === "basic" ? Promise.resolve(null) : this.chromeStatus(),
      choice === "chrome" || choice === "basic" ? Promise.resolve(null) : this.ollamaStatus(),
    ]);
    if (chromeState) out.chrome = chromeState;
    if (ollamaState) out.ollama = ollamaState;
    if (choice !== "basic") {
      if (choice !== "ollama" && out.chrome.availability === "available") {
        Object.assign(out, { mode: "chrome", ready: true, vision: out.chrome.vision, label: "Chrome AI" });
      } else if (choice !== "chrome" && out.ollama.ready) {
        Object.assign(out, { mode: "ollama", ready: true, vision: out.ollama.vision, label: out.ollama.model });
      }
    }
    this.last = out;
    this.lastTime = Date.now();
    return out;
  }

  async chromeStatus() {
    const availability = await this.chromeAI.availability();
    const vision = availability === "available" ? (await this.chromeAI.availability(true)) === "available" : false;
    return { availability, vision };
  }

  async ollamaStatus() {
    const out = { online: false, version: null, models: [], model: this.settings.model, ready: false, vision: false };
    try {
      const client = this.ollama;
      out.version = await client.version();
      out.online = true;
      out.models = await client.models();
      const names = new Set(out.models);
      const wanted = this.settings.model;
      out.ready = names.has(wanted) || (!wanted.includes(":") && names.has(`${wanted}:latest`));
      if (out.ready) out.vision = await client.canSee(wanted);
    } catch (e) {
      out.error = e.message;
    }
    return out;
  }

  /**
   * Ask the AI. history is [{role, content}]. Returns {reply, actions, complete}.
   * onText gets the reply as it streams.
   */
  async respond({ history, message, clipNotes, planSummary, soundCatalog, guess = null, songs = null, onText = null,
    signal = null }) {
    const status = await this.status();
    if (!status.ready) throw new BrainOffline("The AI isn't set up yet.");
    const system = systemPrompt(soundCatalog);
    const context = contextBlock(clipNotes, planSummary, guess, songs);
    let stream = new ReplyStream();
    const read = async (pieces) => {
      stream = new ReplyStream();
      for await (const piece of pieces) {
        const added = stream.feed(piece);
        if (added && onText) onText(added);
      }
    };
    if (status.mode === "chrome") {
      const ask = (past) => this.chromeAI.chat(system, `${historyText(past)}${context}\n\n[User]\n${message}`,
        { schema: ANSWER_SCHEMA, signal });
      try {
        await read(ask(history.slice(-8)));
      } catch (e) {
        if (!e || e.name !== "QuotaExceededError" || stream.buf) throw e;
        try {
          await read(ask([]));  // too much to read: forget the earlier chat and try again
        } catch (e2) {
          if (e2 && e2.name === "QuotaExceededError") {
            throw new BrainError("That was too much for Chrome's AI to read at once. Try a shorter message.");
          }
          throw e2;
        }
      }
    } else {
      const messages = [{ role: "system", content: system }, ...history.slice(-16),
        { role: "user", content: `${context}\n\n[User]\n${message}` }];
      await read(this.ollama.chat(this.settings.model, messages, { schema: ANSWER_SCHEMA, signal }));
    }
    const answer = parseAnswer(stream.buf, stream.text);
    if (!answer.reply && !answer.actions.length) {
      answer.reply = "Hmm, my brain glitched on that one. Can you say it another way?";
    }
    return answer;
  }

  /**
   * Describe what happens in each frame. frames: [{t, jpeg (Blob)}]. Returns [{t, what, tag}].
   */
  async watch(frames, { onProgress = null, signal = null } = {}) {
    const status = await this.status(true);
    if (!status.vision) throw new BrainError("This AI can't look at pictures.");
    const seen = [];
    for (let i = 0; i < frames.length; i++) {
      if (signal && signal.aborted) break;
      const { t, jpeg } = frames[i];
      let text;
      if (status.mode === "chrome") {
        text = await this.chromeAI.look(WATCH_PROMPT(t), jpeg, signal);
      } else {
        const b64 = await blobToBase64(jpeg);
        text = "";
        for await (const piece of this.ollama.chat(this.settings.model,
          [{ role: "user", content: WATCH_PROMPT(t), images: [b64] }],
          { schema: WATCH_SCHEMA, options: { temperature: 0.1, num_predict: 80 }, signal })) {
          text += piece;
        }
      }
      try {
        const data = JSON.parse(text);
        seen.push({ t: P.round(t, 2), what: String(data.what || "").slice(0, 80), tag: String(data.tag || "other") });
      } catch (e) {
        seen.push({ t: P.round(t, 2), what: text.trim().slice(0, 80), tag: "other" });
      }
      if (onProgress) onProgress((i + 1) / frames.length);
    }
    return seen;
  }
}

export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
