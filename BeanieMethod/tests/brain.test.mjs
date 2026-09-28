// The AI brain (Ollama + Chrome's built-in AI), the chat flow, clip analysis and sound effects.
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, test } from "node:test";

import * as B from "../ai/js/engine/brain.js";
import * as P from "../ai/js/engine/plan.js";
import { chat, lobbyChat, faqAnswer } from "../ai/js/engine/chat.js";
import { Project, newProjectData } from "../ai/js/engine/project.js";
import { AudioAnalyzer, VideoAnalyzer, findMoments, describe as describeClip } from "../ai/js/engine/moments.js";
import { BUILTIN, BUILTIN_NAMES, catalog, cleanName, peakDb, synthesize } from "../ai/js/engine/sfx.js";
import { parse } from "../ai/js/engine/commands.js";

// ------------------------------------------------------------------ a stand-in for Ollama
function smartAnswer(body) {
  const last = body.messages.at(-1);
  if (last.images) return JSON.stringify({ what: "grabbing a brainrot from a base", tag: "stealing" });
  const text = last.content.split("[User]\n").at(-1);
  let actions = parse(text, { duration: 60, markers: [], sounds: null }).actions;
  if (/make it good/i.test(text)) actions = [{ do: "apply_skill", skill: "steal_w" }];
  const reply = actions.length ? "On it! Here's your edit 🔥" : "Hey! Send me a clip and tell me what to do 😎";
  return JSON.stringify({ reply, actions });
}

class FakeOllama {
  constructor({ models = ["gemma3:4b"], vision = true, requireNoOrigin = true } = {}) {
    Object.assign(this, { models: [...models], vision, requireNoOrigin, requests: [] });
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  start() {
    return new Promise((resolve) => this.server.listen(0, "127.0.0.1", () => {
      this.url = `http://127.0.0.1:${this.server.address().port}`;
      resolve(this);
    }));
  }

  stop() {
    return new Promise((resolve) => this.server.close(resolve));
  }

  chats() {
    return this.requests.filter(([p]) => p === "/api/chat").map(([, b]) => b);
  }

  handle(req, res) {
    const send = (data, code = 200) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    const stream = (chunks) => {
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      for (const c of chunks) res.write(`${JSON.stringify(c)}\n`);
      res.end();
    };
    // Like the real Ollama: requests from other websites/extensions (with an Origin header) are refused.
    if (this.requireNoOrigin && req.headers.origin) return send({}, 403);
    let raw = "";
    req.on("data", (d) => { raw += d; });
    req.on("end", () => {
      if (req.method === "GET") {
        if (req.url === "/api/version") return send({ version: "0.99.0-fake" });
        if (req.url === "/api/tags") return send({ models: this.models.map((name) => ({ name, size: 1 })) });
        return send({ error: "not found" }, 404);
      }
      const body = JSON.parse(raw || "{}");
      this.requests.push([req.url, body]);
      if (req.url === "/api/show") return send({ capabilities: ["completion", ...(this.vision ? ["vision"] : [])] });
      if (req.url === "/api/pull") {
        this.models.push(body.model);
        return stream([{ status: "pulling manifest" }, { status: "downloading", total: 100, completed: 40 },
          { status: "downloading", total: 100, completed: 100 }, { status: "success" }]);
      }
      if (req.url === "/api/chat") {
        if (!this.models.includes(body.model)) return send({ error: `model '${body.model}' not found` }, 404);
        const content = smartAnswer(body);
        const pieces = [];
        for (let i = 0; i < content.length; i += 7) pieces.push(content.slice(i, i + 7));
        return stream([...pieces.map((p) => ({ message: { role: "assistant", content: p }, done: false })),
          { message: { role: "assistant", content: "" }, done: true }]);
      }
      return send({ error: "not found" }, 404);
    });
    return undefined;
  }
}

const settingsFor = (url, extra = {}) => ({ brain: "auto", ollama_url: url, model: "gemma3:4b", instant_commands: true, ...extra });
const noChrome = { availability: async () => "missing", present: false };

describe("reply stream", () => {
  test("streams the reply through escapes", () => {
    const reply = 'Nice "W" 💀\nline two é';
    const plain = JSON.stringify({ reply, actions: [{ do: "flash", at: 2 }] });
    const escaped = JSON.stringify({ reply, actions: [] }).replace(/[\u007f-￿]/g,
      (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
    for (const text of [plain, escaped]) {
      for (const size of [1, 2, 3, 5, 11]) {
        const s = new B.ReplyStream();
        let got = "";
        for (let i = 0; i < text.length; i += size) got += s.feed(text.slice(i, i + size));
        assert.equal(got, reply, `${size} ${text}`);
        assert.ok(s.finished);
      }
    }
  });

  test("parseAnswer recovers cut-off JSON", () => {
    const full = '{"reply":"ok","actions":[{"do":"zoom","at":3},{"do":"text","text":"a } b","at":4},{"do":"stick';
    const got = B.parseAnswer(full, "ok");
    assert.deepEqual(got.actions, [{ do: "zoom", at: 3 }, { do: "text", text: "a } b", at: 4 }]);
    assert.equal(got.complete, false);
    const good = B.parseAnswer('{"reply":"hi","actions":[]}');
    assert.deepEqual([good.reply, good.actions, good.complete], ["hi", [], true]);
    const chatty = B.parseAnswer('Sure! ```json\n{"reply":"done","actions":[{"do":"flash","at":1}]}\n```');
    assert.deepEqual([chatty.reply, chatty.actions], ["done", [{ do: "flash", at: 1 }]]);
    const plain = B.parseAnswer("Just words, no JSON at all.");
    assert.deepEqual([plain.reply, plain.actions], ["Just words, no JSON at all.", []]);
  });

  test("the schema matches the plan actions and the prompt is filled in", () => {
    assert.deepEqual(new Set(B.ACTION_SCHEMA.properties.do.enum), new Set(P.ACTIONS));
    const prompt = B.systemPrompt(catalog());
    assert.ok(prompt.includes("steal_w"));
    assert.ok(prompt.includes("- boom:"));
    assert.ok(!prompt.includes("{skills}") && !prompt.includes("{sounds}"));
    assert.ok(!JSON.stringify(B.simpleSchema()).includes("anyOf"));
  });
});

describe("ollama", () => {
  let fake;
  before(async () => { fake = await new FakeOllama().start(); });
  after(async () => { await fake.stop(); });

  test("status: ready with vision", async () => {
    const st = await new B.Brain(settingsFor(fake.url), { chromeAI: noChrome }).status();
    assert.ok(st.ready && st.vision && st.mode === "ollama" && st.ollama.online, JSON.stringify(st));
  });

  test("status when the model is missing or Ollama is off", async () => {
    const other = await new FakeOllama({ models: ["llama3.2:3b"] }).start();
    try {
      const st = await new B.Brain(settingsFor(other.url), { chromeAI: noChrome }).status();
      assert.ok(st.ollama.online && !st.ready && st.mode === "basic");
    } finally {
      await other.stop();
    }
    const off = await new B.Brain(settingsFor(other.url), { chromeAI: noChrome }).status();
    assert.ok(!off.ollama.online && !off.ready);
  });

  test("respond streams and returns actions", async () => {
    const brain = new B.Brain(settingsFor(fake.url), { chromeAI: noChrome });
    const pieces = [];
    const ans = await brain.respond({
      history: [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }],
      message: "add a skull at the end", clipNotes: "Clip: 20 s", planSummary: "📱 Vertical",
      soundCatalog: catalog(), onText: (t) => pieces.push(t),
    });
    const body = fake.chats().at(-1);
    assert.deepEqual(ans.actions, [{ do: "sticker", emoji: "💀", at: "end" }]);
    assert.equal(pieces.join(""), ans.reply);
    assert.ok(pieces.length > 1, "the reply should arrive in pieces");
    assert.deepEqual(body.format, B.ANSWER_SCHEMA);
    assert.deepEqual(body.messages.map((m) => m.role), ["system", "user", "assistant", "user"]);
    assert.ok(body.messages.at(-1).content.includes("[Clip notes]"));
  });

  test("a missing model is a clear error", async () => {
    const empty = await new FakeOllama({ models: [] }).start();
    try {
      const client = new B.OllamaClient(empty.url);
      await assert.rejects(async () => { for await (const p of client.chat("gemma3:4b", [])) void p; },
        (e) => e instanceof B.BrainError && e.message.includes("isn't downloaded"));
      const steps = [];
      for await (const s of client.pull("gemma3:4b")) steps.push(s);
      assert.equal(steps.at(-1).status, "success");
      assert.ok((await client.models()).includes("gemma3:4b"));
    } finally {
      await empty.stop();
    }
  });

  test("a 403 (Ollama refusing the extension) says what to do", async () => {
    const client = new B.OllamaClient(fake.url, (url, opts) => fetch(url, { ...opts, headers: { ...opts.headers, Origin: "chrome-extension://abc" } }));
    await assert.rejects(client.version(), (e) => e instanceof B.BrainError && e.message.includes("403"));
  });

  test("watch", async () => {
    const brain = new B.Brain(settingsFor(fake.url), { chromeAI: noChrome });
    const jpeg = new Blob([new Uint8Array([106, 112, 101, 103])]);
    const seen = await brain.watch([{ t: 1.0, jpeg }, { t: 2.5, jpeg }]);
    assert.deepEqual(fake.chats().at(-1).messages[0].images, ["anBlZw=="]);
    assert.deepEqual(seen.map((s) => s.tag), ["stealing", "stealing"]);
    assert.deepEqual(B.momentFromVision(seen), [1.0, "steal"]);
  });
});

// ------------------------------------------------------------------ Chrome's built-in AI (faked)
class FakeSession {
  constructor(api, opts) {
    this.api = api;
    this.opts = opts;
    this.destroyed = false;
  }

  async clone() {
    return new FakeSession(this.api, this.opts);
  }

  promptStreaming(text, opts) {
    this.api.prompts.push({ text, opts, system: this.opts.initialPrompts && this.opts.initialPrompts[0].content });
    if (this.api.rejectSchema && opts.responseConstraint) {
      const e = new Error("schema not supported");
      e.name = "NotSupportedError";
      throw e;
    }
    const answer = JSON.stringify({ reply: "Freezing it 🧊", actions: [{ do: "freeze", at: 5, bw: true }] });
    const cumulative = this.api.cumulative;
    return (async function* stream() {
      for (let i = 4; i < answer.length + 4; i += 4) yield cumulative ? answer.slice(0, i) : answer.slice(i - 4, i);
    }());
  }

  destroy() {
    this.destroyed = true;
  }
}

function fakeLanguageModel({ availability = "available", cumulative = false, rejectSchema = false } = {}) {
  const api = {
    prompts: [], created: [], cumulative, rejectSchema,
    availability: async () => availability,
    create: async (opts) => {
      api.created.push(opts);
      return new FakeSession(api, opts);
    },
  };
  return api;
}

describe("chrome built-in AI", () => {
  for (const cumulative of [false, true]) {
    test(`answers stream in (${cumulative ? "whole answer so far" : "new text"} each time)`, async () => {
      const api = fakeLanguageModel({ cumulative });
      const brain = new B.Brain(settingsFor("http://127.0.0.1:9"), { chromeAI: new B.ChromeAI(api) });
      const st = await brain.status(true);
      assert.deepEqual([st.mode, st.ready, st.label], ["chrome", true, "Chrome AI"]);
      const pieces = [];
      const ans = await brain.respond({ history: [{ role: "user", content: "hey" }], message: "freeze at 5 bw",
        clipNotes: "Clip: 10 s", planSummary: "", soundCatalog: catalog(), onText: (t) => pieces.push(t) });
      assert.deepEqual(ans.actions, [{ do: "freeze", at: 5, bw: true }]);
      assert.equal(pieces.join(""), "Freezing it 🧊");
      const sent = api.prompts.at(-1);
      assert.ok(sent.system.includes("You are Beanie"));
      assert.ok(sent.text.includes("[Earlier in this chat]\nUser: hey") && sent.text.includes("[Clip notes]"));
      assert.deepEqual(sent.opts.responseConstraint, B.ANSWER_SCHEMA);
    });
  }

  test("falls back to a simpler answer shape", async () => {
    const api = fakeLanguageModel({ rejectSchema: true });
    const ai = new B.ChromeAI(api);
    let text = "";
    for await (const p of ai.chat("sys", "hi", { schema: B.ANSWER_SCHEMA })) text += p;
    assert.ok(text.includes("Freezing"));
    assert.equal(ai.schemaMode, 2);
  });

  test("a small model gets shorter instructions and forgets old chat when it's too much", async () => {
    const quota = (name = "QuotaExceededError") => Object.assign(new Error("too much"), { name });
    const api = fakeLanguageModel();
    const create = api.create;
    api.create = async (opts) => {
      if (opts.initialPrompts && opts.initialPrompts[0].content.includes("Examples:")) throw quota();
      return create(opts);
    };
    const session = FakeSession.prototype.promptStreaming;
    FakeSession.prototype.promptStreaming = function promptStreaming(text, opts) {
      if (text.includes("[Earlier in this chat]")) throw quota();
      return session.call(this, text, opts);
    };
    try {
      const brain = new B.Brain(settingsFor("http://127.0.0.1:9"), { chromeAI: new B.ChromeAI(api) });
      const ans = await brain.respond({ history: [{ role: "user", content: "old stuff" }], message: "freeze at 5",
        clipNotes: "Clip: 10 s", planSummary: "", soundCatalog: catalog() });
      assert.deepEqual(ans.actions, [{ do: "freeze", at: 5, bw: true }]);
      const system = api.created.at(-1).initialPrompts[0].content;
      assert.ok(!system.includes("Examples:") && system.includes("You are Beanie"));
      assert.ok(!api.prompts.at(-1).text.includes("old stuff"));
    } finally {
      FakeSession.prototype.promptStreaming = session;
    }
    assert.ok(B.compactPrompt(B.systemPrompt(catalog())).length < B.systemPrompt(catalog()).length * 0.8);
  });

  test("the user can choose which AI to use", async () => {
    const fake = await new FakeOllama().start();
    try {
      const ai = new B.ChromeAI(fakeLanguageModel());
      assert.equal((await new B.Brain(settingsFor(fake.url), { chromeAI: ai }).status()).mode, "chrome");
      assert.equal((await new B.Brain(settingsFor(fake.url, { brain: "ollama" }), { chromeAI: ai }).status()).mode, "ollama");
      assert.equal((await new B.Brain(settingsFor(fake.url, { brain: "basic" }), { chromeAI: ai }).status()).mode, "basic");
      const down = new B.ChromeAI(fakeLanguageModel({ availability: "downloadable" }));
      const st = await new B.Brain(settingsFor("http://127.0.0.1:9"), { chromeAI: down }).status();
      assert.deepEqual([st.mode, st.chrome.availability], ["basic", "downloadable"]);
    } finally {
      await fake.stop();
    }
  });
});

// ------------------------------------------------------------------ the chat flow
function readyProject() {
  const data = newProjectData({ id: "p1", name: "clip", source: {}, info: { duration: 13, width: 1280, height: 720, fps: 30, has_audio: true } });
  data.status = "ready";
  data.analysis = { moments: [{ t: 0, end: 1.5, kind: "dark", label: "Dark screen (loading?)" }], dead_start: 1.5, dead_end: null, highlight: 6 };
  let saves = 0;
  const p = new Project(data, () => { saves += 1; });
  p.saves = () => saves;
  return p;
}

const ENV = { sounds: BUILTIN_NAMES, music: [], catalog: catalog() };

describe("chat", () => {
  test("instant commands work without any AI", async () => {
    const project = readyProject();
    const brain = new B.Brain(settingsFor("http://127.0.0.1:9", { brain: "basic" }), { chromeAI: noChrome });
    const events = [];
    const done = await chat({ project, message: "cut out 0 to 1.5 and add a skull at the end", brain,
      settings: { instant_commands: true }, env: ENV, emit: (e) => events.push(e) });
    assert.equal(done.type, "done");
    assert.equal(project.plan.remove[0].start, 0);
    assert.equal(project.plan.sticker[0].emoji, "💀");
    const help = await chat({ project, message: "make it look amazing", brain, settings: {}, env: ENV, emit: () => {} });
    assert.ok(help.reply.includes("Set up AI"));
    await chat({ project, message: "undo", brain, settings: {}, env: ENV, emit: () => {} });
    assert.deepEqual(project.plan.sticker, []);
    assert.ok(project.redo());
    assert.equal(project.plan.sticker.length, 1);
    assert.ok(project.saves() > 3);
    assert.equal(project.data.chat.filter((m) => m.role === "user").length, 3);
  });

  test("the AI streams and edits", async () => {
    const fake = await new FakeOllama().start();
    try {
      const project = readyProject();
      const brain = new B.Brain(settingsFor(fake.url), { chromeAI: noChrome });
      const events = [];
      const done = await chat({ project, message: "make it good", brain, settings: { instant_commands: false }, env: ENV,
        emit: (e) => events.push(e) });
      const texts = events.filter((e) => e.type === "text").map((e) => e.text);
      assert.ok(texts.length > 1);
      assert.equal(texts.join(""), done.reply);
      assert.ok(done.streamed);
      assert.ok(done.done.some((d) => d.includes("W steal edit")), done.done.join(" | "));
      assert.ok(project.plan.zoom.length);
      const sent = fake.chats().at(-1).messages.at(-1).content;
      assert.ok(sent.includes("[Clip notes]") && sent.includes("Dark screen"));
    } finally {
      await fake.stop();
    }
  });

  test("markers and 'here'", async () => {
    const project = readyProject();
    project.addMarker(9, "steal");
    project.addMarker(6.02, "steal");
    assert.deepEqual(project.data.markers.map((m) => m.t), [6.02], "marking again moves the mark");
    const brain = new B.Brain(settingsFor("http://127.0.0.1:9", { brain: "basic" }), { chromeAI: noChrome });
    await chat({ project, message: "zoom on the steal", brain, settings: {}, env: ENV, emit: () => {} });
    assert.equal(project.plan.zoom[0].at, 6.02);
    await chat({ project, message: "skull here", now: 4.2, brain, settings: {}, env: ENV, emit: () => {} });
    assert.equal(project.plan.sticker[0].at, 4.2);
    assert.ok(project.clipNotes().includes('"steal" at 6.0 s'));
  });

  test("a whole skill gets a short reply with the changes listed under it", async () => {
    const project = readyProject();
    const brain = new B.Brain(settingsFor("http://127.0.0.1:9", { brain: "basic" }), { chromeAI: noChrome });
    const done = await chat({ project, message: "make a W edit", brain, settings: {}, env: ENV, emit: () => {} });
    assert.match(done.reply, /^\S+ \S* ?W steal edit at 6\.0s \(\d+ changes\)\.$/);
    assert.ok(done.list && done.done.length > 4);
    assert.deepEqual(project.data.chat.at(-1).done, done.done);
    const small = await chat({ project, message: "flash at 3", brain, settings: {}, env: ENV, emit: () => {} });
    assert.ok(small.reply.includes("Flash at 3.0s") && !small.list);
  });

  test("lobby chat and FAQ", async () => {
    const brain = new B.Brain(settingsFor("http://127.0.0.1:9", { brain: "basic" }), { chromeAI: noChrome });
    const lobby = [];
    const out = await lobbyChat({ lobby, message: "hi", brain, env: ENV, emit: () => {} });
    assert.ok(out.reply.includes("Beanie"));
    assert.equal(lobby.length, 2);
    assert.ok(faqAnswer("how do I record my steals?").includes("Win + Alt + R"));
    assert.ok(faqAnswer("where is my video saved").includes("Downloads"));
  });
});

// ------------------------------------------------------------------ analysis
/** The 13 s test clip, as frames: black, moving, still bright (menu), moving. */
function syntheticAnalysis() {
  const video = new VideoAnalyzer(0.1);
  const size = 64 * 36;
  for (let i = 0; i < 130; i++) {
    const t = i / 10;
    const plane = new Uint8Array(size);
    for (let p = 0; p < size; p++) {
      if (t < 1.5) plane[p] = 16;
      else if (t >= 8 && t < 10.5) plane[p] = 225;
      else plane[p] = 16 + ((p * 7 + i * 31 + (p % 64) * i) % 200);
    }
    video.push(t, plane);
  }
  const v = video.finish(13);
  const audio = new AudioAnalyzer(48000);
  const rate = 48000;
  let seed = 1;
  const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const chunk = 4800;
  for (let start = 0; start < 13 * rate; start += chunk) {
    const left = new Float32Array(chunk);
    for (let i = 0; i < chunk; i++) {
      const t = (start + i) / rate;
      const beep = (t >= 6 && t <= 6.3) || (t >= 11.5 && t <= 11.8) ? 0.8 * Math.sin(2 * Math.PI * 880 * t) : 0;
      left[i] = 0.02 * noise() + beep;
    }
    audio.push([left, left]);
  }
  return { ...v, audio: audio.finish() };
}

describe("analysis", () => {
  test("finds the loading screen, the menu and the loud moments", () => {
    const a = syntheticAnalysis();
    const found = findMoments(13, a.scene, a.black, a.freeze, a.luma, a.audio);
    assert.equal(found.dead_start, 1.5);
    const still = found.moments.find((m) => m.kind === "still");
    assert.ok(still && Math.abs(still.t - 8) < 0.15 && Math.abs(still.end - 10.5) < 0.15, JSON.stringify(found.moments));
    assert.ok(still.label.includes("bright"));
    const louds = found.moments.filter((m) => m.kind === "loud").map((m) => m.t);
    assert.ok(louds.some((t) => Math.abs(t - 6) < 0.15) && louds.some((t) => Math.abs(t - 11.5) < 0.15), louds.join());
    assert.ok([6, 11.5].some((t) => Math.abs(found.highlight - t) < 0.15));
    const notes = describeClip({ duration: 13, width: 640, height: 360, fps: 30, has_audio: true }, found);
    assert.ok(notes.includes("Boring start (loading/menu) ends at 1.5 s."));
  });
});

// ------------------------------------------------------------------ sounds
describe("sound effects", () => {
  test("every built-in sound is made, lasts as long as it says and peaks at -4 dB", () => {
    for (const name of BUILTIN_NAMES) {
      const s = synthesize(name);
      assert.equal(s.length, Math.round(BUILTIN[name].seconds * 48000), name);
      assert.ok(Math.abs(peakDb(s) - -4) < 0.01, `${name} ${peakDb(s)}`);
      assert.ok(s.every(Number.isFinite), name);
    }
    assert.equal(synthesize("boom"), synthesize("boom"), "made once, then reused");
  });

  test("user sound names", () => {
    assert.equal(cleanName("Vine Boom (1).mp3"), "vine_boom_1");
    assert.equal(cleanName("???"), "sound");
    assert.ok(catalog(["vine_boom_1"]).vine_boom_1.includes("your own"));
  });
});
