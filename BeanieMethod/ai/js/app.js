/* Beanie Pro · AI Editor - the editor page. Everything runs in this tab, on this PC. */

import { Brain, RECOMMENDED_MODELS, momentFromVision } from "./engine/brain.js";
import * as P from "./engine/plan.js";
import { chat, instantReply, lobbyChat } from "./engine/chat.js";
import { Project, newProjectData } from "./engine/project.js";
import { BUILTIN, BUILTIN_NAMES, catalog, cleanName } from "./engine/sfx.js";
import { loadSettings, saveSettings, store } from "./store.js";
import { MediaError, VIDEO_EXTENSIONS, analyzeClip, canPlay, grabFrames, posterOf, probe, toMp4 } from "./media.js";
import { OverlayCache } from "./overlays.js";
import { SoundBank } from "./audio.js";
import { EditedPlayer } from "./player.js";
import { exportVideo } from "./exporter.js";
import * as platform from "./platform.js";

// ------------------------------------------------------------------ small helpers
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md = (text) => esc(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\n/g, "<br>");
const fmt = (t) => `${Number(t || 0).toFixed(1)}s`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

let toastTimer = null;
function toast(text, ms = 3800) {
  const t = $("#toast");
  t.innerHTML = md(text);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

function timeAgo(sec) {
  const d = Date.now() / 1000 - sec;
  if (d < 90) return "just now";
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return `${Math.round(d / 86400)} days ago`;
}

function newProjectId() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${P.newId()}`;
}

// ------------------------------------------------------------------ app state
const S = {
  settings: null,
  brain: null,
  status: null,
  bank: new SoundBank(),
  overlays: new OverlayCache(),
  project: null,       // the open clip (Project)
  source: null,        // its video (Blob)
  sourceUrl: null,
  thumbsUrl: null,
  mounted: null,       // id of the clip shown in the editor
  view: "edited",
  player: null,
  chatBusy: false,
  exporting: null,     // AbortController while exporting
  analyzing: null,     // AbortController while looking at a clip
  watching: false,
  lobby: [],
  saveTimer: null,
  folder: null,
  posters: new Map(),
  previewAudio: null,
  playingSound: null,
};

function env() {
  const mine = S.bank.userNames("sound");
  return { sounds: [...new Set([...BUILTIN_NAMES, ...mine])], music: S.bank.userNames("music"), catalog: catalog(mine) };
}

// ------------------------------------------------------------------ saving
function onProjectChange(project) {
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(() => saveProject(project), 200);
}

async function saveProject(project) {
  try {
    await store.putProject(project.data);
  } catch (e) {
    toast(`I couldn't save your edit: ${e.message}`);
  }
}

// ------------------------------------------------------------------ header + AI status
async function refreshStatus(fresh = false) {
  try {
    S.status = await S.brain.status(fresh);
  } catch (e) {
    S.status = { ready: false, mode: "basic", chrome: { availability: "missing" }, ollama: { online: false } };
  }
  renderHeader();
  if (S.mounted) updateWatchButton();
  return S.status;
}

function renderHeader() {
  const st = S.status;
  const pill = $("#brain-pill");
  const setup = $("#btn-setup");
  if (!st) return;
  if (st.ready) {
    pill.className = "pill ok";
    pill.textContent = `🧠 AI ready · ${st.label}`;
    pill.title = st.mode === "chrome" ? "Chrome's built-in AI (Gemini Nano), running on this PC" : `Ollama model ${st.label}, running on this PC`;
    setup.textContent = "AI settings";
    setup.className = "btn ghost small";
  } else {
    pill.className = "pill warn";
    pill.textContent = "🧠 Basic mode";
    pill.title = "Simple commands work now. Set up the AI for full chat.";
    setup.textContent = "Set up AI";
    setup.className = "btn primary small";
  }
}

// ------------------------------------------------------------------ chat
function greeting() {
  if (!S.project) {
    return "Hey, I'm **Beanie** 👋 your AI video editor, right here in Beanie Pro.\n\n"
      + "Add a clip on the right (drop it in, or pick one of your recordings), then tell me how to edit it: "
      + "\"make a W edit\", \"fail edit with a skull\", \"cut the loading screen\"…";
  }
  const p = S.project;
  if (p.data.status === "analyzing") return "Looking at your clip… 👀";
  if (p.data.status === "error") return p.data.error || "That clip didn't work.";
  const a = p.analysis || {};
  const parts = [`Got your clip! It's ${fmt(p.info.duration)} long.`];
  if (a.dead_start) parts.push(`The first ${fmt(a.dead_start)} look like loading.`);
  if (a.highlight !== null && a.highlight !== undefined) parts.push(`My guess for the big moment: **${fmt(a.highlight)}**.`);
  parts.push("\n\nPause at the steal and press **📍 Mark steal here**, then say **make a W edit** (or **fail edit** if it went wrong 💀).");
  return parts.join(" ");
}

function addBubble(role, text, done, warnings) {
  const kind = role === "user" ? "user" : role === "system" ? "system" : "bot";
  const msg = el(`<div class="msg ${kind}">${kind === "user" ? "" : '<div class="avatar"></div>'}<div class="bubble"></div></div>`);
  const bubble = $(".bubble", msg);
  bubble.innerHTML = md(text);
  addDoneList(bubble, done, warnings);
  $("#chat-log").append(msg);
  return bubble;
}

function addDoneList(bubble, done, warnings) {
  if (!(done && done.length) && !(warnings && warnings.length)) return;
  const ul = el('<ul class="done-list"></ul>');
  const items = (done || []).map((d) => el(`<li>✓ ${esc(d)}</li>`));
  (warnings || []).forEach((w) => items.push(el(`<li class="warn">⚠ ${esc(w)}</li>`)));
  const SHOW = 5;
  items.forEach((li, i) => {
    if (i >= SHOW) li.hidden = true;
    ul.append(li);
  });
  if (items.length > SHOW) {
    const more = el(`<button class="more-done" type="button">+${items.length - SHOW} more</button>`);
    more.onclick = () => {
      items.forEach((li) => { li.hidden = false; });
      more.remove();
    };
    ul.append(more);
  }
  bubble.append(ul);
}

function scrollChat() {
  const log = $("#chat-log");
  log.scrollTop = log.scrollHeight;
}

function renderChat() {
  if (S.chatBusy) return;
  $("#chat-log").innerHTML = "";
  addBubble("assistant", greeting());
  const msgs = S.project ? S.project.data.chat : S.lobby;
  msgs.slice(-80).forEach((m) => addBubble(m.role, m.content, m.done, m.warnings));
  scrollChat();
  renderChips();
}

function renderChips() {
  const box = $("#chips");
  box.innerHTML = "";
  let chips;
  if (!S.project) {
    chips = [["🎥 How do I record?", "How do I record my steals?"], ["🤔 What can you do?", "What can you do?"]];
  } else if (!S.project.ready) {
    chips = [];
  } else {
    chips = [
      ["🏆 W edit", "make a W edit"], ["💀 Fail edit", "make a fail edit"], ["⏳ Suspense", "make a suspense edit"],
      ["🔥 Hype", "make a hype edit"], ["✂️ Cut boring parts", "cut the boring parts"],
      ["🔍 Zoom here", "zoom here"], ["🐢 Slow-mo here", "slow mo here"], ["💀 Skull at the end", "add a skull at the end"],
      ["🧊 Freeze here", "freeze here black and white"], ["📱 Crop to fill", "make it vertical and crop it"],
      ["↩️ Undo", "undo"],
    ];
  }
  chips.forEach(([label, text]) => {
    const b = el(`<button class="chip" type="button">${esc(label)}</button>`);
    b.onclick = () => send(text);
    box.append(b);
  });
}

/** The clip time the user is looking at (null if nothing is shown). */
function currentClipTime() {
  if (!S.mounted) return null;
  if (S.view === "original") {
    const v = $("#vid-original");
    return v && Number.isFinite(v.currentTime) ? v.currentTime : null;
  }
  return S.player ? S.player.clipTime() : null;
}

async function send(textArg) {
  const input = $("#input");
  const text = (textArg ?? input.value).trim();
  if (!text || S.chatBusy) return;
  if (S.project && !S.project.ready) {
    toast("Hang on, I'm still looking at your clip…");
    return;
  }
  input.value = "";
  autosize();
  S.chatBusy = true;
  $("#send").disabled = true;
  addBubble("user", text);
  const bubble = addBubble("assistant", "");
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i> <span class="t">thinking…</span></span>';
  scrollChat();
  const started = Date.now();
  const timer = setInterval(() => {
    const t = $(".t", bubble);
    if (!t) return;
    const s = Math.round((Date.now() - started) / 1000);
    t.textContent = s < 6 ? "thinking…" : `thinking… ${s}s (the first answer takes longer while my brain wakes up)`;
  }, 1000);
  let streamed = "";
  let error = null;
  const emit = (ev) => {
    if (ev.type === "text") {
      streamed += ev.text;
      bubble.innerHTML = md(streamed);
      scrollChat();
    } else if (ev.type === "error") {
      error = ev.message;
    }
  };
  const project = S.project;
  const before = project ? project.data.plan_version : 0;
  try {
    let last;
    if (project) {
      last = await chat({ project, message: text, now: currentClipTime(), brain: S.brain, settings: S.settings, env: env(), emit });
    } else {
      last = await lobbyChat({ lobby: S.lobby, message: text, brain: S.brain, env: env(), emit });
      store.set("lobby", S.lobby).catch(() => {});
    }
    if (last) {
      bubble.innerHTML = md(last.reply);
      if (last.list) addDoneList(bubble, last.done, last.warnings);
    } else {
      bubble.closest(".msg").className = "msg system";
      bubble.innerHTML = md(error || "Something went wrong.");
    }
  } catch (e) {
    bubble.closest(".msg").className = "msg system";
    bubble.innerHTML = md(`I couldn't answer: ${e.message}`);
  } finally {
    clearInterval(timer);
    S.chatBusy = false;
    $("#send").disabled = false;
    scrollChat();
    input.focus();
  }
  if (project && project === S.project && project.data.plan_version !== before) {
    await editChanged({ play: true });
  }
}

function autosize() {
  const t = $("#input");
  t.style.height = "auto";
  t.style.height = `${Math.min(140, t.scrollHeight)}px`;
}

// ------------------------------------------------------------------ home (import) screen
function unmount() {
  if (S.player) S.player.destroy();
  S.player = null;
  S.mounted = null;
  if (S.analyzing) S.analyzing.abort();
  S.analyzing = null;
  for (const key of ["sourceUrl", "thumbsUrl"]) {
    if (S[key]) URL.revokeObjectURL(S[key]);
    S[key] = null;
  }
}

async function showHome() {
  unmount();
  S.project = null;
  S.source = null;
  store.set("last_project", null).catch(() => {});
  const ed = $("#editor");
  ed.innerHTML = "";
  ed.append($("#tpl-import").content.cloneNode(true));
  $("#file").onchange = (e) => importFile(e.target.files[0]);
  $("#recent-refresh").onclick = () => loadRecent();
  $("#recent-folder").onclick = pickFolder;
  if (!window.showDirectoryPicker) $("#recent-folder").hidden = true;
  renderChat();
  loadRecent();
}

async function pickFolder() {
  try {
    const handle = await window.showDirectoryPicker({ id: "beanie-recordings", mode: "read", startIn: "videos" });
    S.folder = handle;
    await store.set("folder", handle);
    loadRecent();
  } catch (e) {
    if (e.name !== "AbortError") toast(e.message);
  }
}

async function findVideos(dir, depth, out = []) {
  for await (const entry of dir.values()) {
    if (out.length > 400) break;
    if (entry.kind === "file" && VIDEO_EXTENSIONS.test(entry.name)) {
      try {
        const f = await entry.getFile();
        if (f.size > 100000) out.push(f);
      } catch (e) { /* locked or gone */ }
    } else if (entry.kind === "directory" && depth > 0 && !entry.name.startsWith(".")) {
      await findVideos(entry, depth - 1, out);
    }
  }
  return out;
}

async function loadRecent(ask = false) {
  const grid = $("#recent-grid");
  if (!grid) return;
  if (!window.showDirectoryPicker) {
    grid.innerHTML = '<div class="muted">Drop a video above, or press <b>choose a video</b>.</div>';
    return;
  }
  const handle = S.folder || (await store.get("folder").catch(() => null));
  if (!handle) {
    grid.innerHTML = '<div class="muted">Press <b>📂 Pick folder</b> and choose your <b>Videos</b> folder once: your recordings will show up here.</div>';
    return;
  }
  let perm = await handle.queryPermission({ mode: "read" });
  if (perm !== "granted" && ask) perm = await handle.requestPermission({ mode: "read" }).catch(() => "denied");
  if (perm !== "granted") {
    grid.innerHTML = "";
    const b = el(`<button class="btn small" type="button">🔓 Show my recordings from “${esc(handle.name)}”</button>`);
    b.onclick = () => loadRecent(true);
    grid.append(b);
    return;
  }
  S.folder = handle;
  grid.innerHTML = '<div class="muted">Looking…</div>';
  let files;
  try {
    files = await findVideos(handle, 2);
  } catch (e) {
    grid.innerHTML = `<div class="muted">${esc(e.message)}</div>`;
    return;
  }
  files.sort((a, b) => b.lastModified - a.lastModified);
  files = files.slice(0, 12);
  grid.innerHTML = "";
  if (!files.length) {
    grid.append(el(`<div class="muted">No videos in “${esc(handle.name)}” yet. Record with <kbd>Win</kbd> + <kbd>Alt</kbd> + <kbd>R</kbd>, or pick another folder.</div>`));
    return;
  }
  for (const f of files) {
    const card = el(`<button class="clip-card" type="button"><img class="pic" alt="">
      <div class="meta"><b>${esc(f.name)}</b><span class="muted">${timeAgo(f.lastModified / 1000)} · ${(f.size / 1048576).toFixed(0)} MB</span></div></button>`);
    card.onclick = () => importFile(f);
    grid.append(card);
    const key = `${f.name}:${f.lastModified}:${f.size}`;
    const img = $("img", card);
    if (S.posters.has(key)) img.src = S.posters.get(key);
    else {
      posterOf(f).then((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        S.posters.set(key, url);
        img.src = url;
      }).catch(() => {});
    }
  }
}

function dropStatus(text, frac = null) {
  const s = $("#drop-status");
  const bar = $(".upload-bar");
  const drop = $("#drop");
  if (!s) return;
  s.textContent = text || "";
  if (bar) {
    bar.hidden = frac === null;
    if (frac !== null) bar.firstElementChild.style.width = `${Math.round(frac * 100)}%`;
  }
  if (drop) drop.classList.toggle("busy", Boolean(text));
}

async function importFile(file) {
  if (!file) return;
  if (!/^video\//.test(file.type) && !VIDEO_EXTENSIONS.test(file.name)) {
    toast("That doesn't look like a video file.");
    return;
  }
  if (S.mounted || !$("#drop")) await showHome();
  dropStatus(`Opening ${file.name}…`, 0.02);
  let blob = file;
  let info;
  try {
    info = await probe(blob);
    const native = ["video/mp4", "video/quicktime", "video/webm"].includes(info.mime);
    if (!native || !(await canPlay(blob))) {
      dropStatus("Getting it ready…", 0.05);
      blob = await toMp4(blob, (p) => dropStatus("Getting it ready…", 0.05 + 0.9 * p));
      info = await probe(blob);
      if (!(await canPlay(blob))) throw new MediaError("Chrome can't play this video. Try recording as MP4 (H.264).");
    }
  } catch (e) {
    dropStatus("");
    toast(e instanceof MediaError ? e.message : `I couldn't open that video: ${e.message}`, 6000);
    return;
  }
  const id = newProjectId();
  const name = file.name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_\- ]+/gu, "").trim().slice(0, 40) || "clip";
  const data = newProjectData({ id, name, info, source: { name: file.name, size: file.size, type: file.type, modified: file.lastModified } });
  try {
    dropStatus("Saving…", 0.98);
    await store.putFile(`src:${id}`, blob);
    await store.putProject(data);
  } catch (e) {
    dropStatus("");
    toast(`I couldn't save that clip (${e.message}). Is your disk full?`, 6000);
    return;
  }
  await openProject(id);
}

// ------------------------------------------------------------------ opening a clip
async function openProject(id) {
  const data = await store.getProject(id).catch(() => null);
  const source = data ? await store.getFile(`src:${id}`).catch(() => null) : null;
  if (!data || !source) {
    if (data) toast("The video for that clip is gone. Add it again.");
    return showHome();
  }
  unmount();
  S.project = new Project(data, onProjectChange);
  S.source = source;
  S.sourceUrl = URL.createObjectURL(source);
  const thumbs = await store.getFile(`thumbs:${id}`).catch(() => null);
  S.thumbsUrl = thumbs ? URL.createObjectURL(thumbs) : null;
  store.set("last_project", id).catch(() => {});
  renderProject();
  renderChat();
  if (data.status === "analyzing") runAnalysis();
}

async function runAnalysis() {
  const p = S.project;
  if (!p || S.analyzing) return;
  const ctrl = new AbortController();
  S.analyzing = ctrl;
  p.data.status = "analyzing";
  p.data.progress = 0;
  renderProject();
  try {
    const { analysis, thumbs } = await analyzeClip(S.source, p.info, {
      signal: ctrl.signal,
      onProgress: (f) => {
        p.data.progress = f;
        const bar = $("#analyze-bar");
        if (bar && S.project === p) {
          bar.style.width = `${Math.round(f * 100)}%`;
          $("#analyze-pct").textContent = `${Math.round(f * 100)}%`;
        }
      },
    });
    await store.putFile(`thumbs:${p.id}`, thumbs);
    if (S.project === p) {
      if (S.thumbsUrl) URL.revokeObjectURL(S.thumbsUrl);
      S.thumbsUrl = URL.createObjectURL(thumbs);
    }
    p.data.analysis = analysis;
    p.data.status = "ready";
    p.data.progress = 1;
    p.changed();
  } catch (e) {
    if (ctrl.signal.aborted) return;
    p.data.status = "error";
    p.data.error = `I couldn't read that video. ${e.message}`;
    p.changed();
  } finally {
    if (S.analyzing === ctrl) S.analyzing = null;
  }
  if (S.project === p) {
    renderProject();
    renderChat();
  }
}

// ------------------------------------------------------------------ the editor
function renderProject() {
  const p = S.project;
  const ed = $("#editor");
  if (!p) return showHome();
  if (p.data.status === "analyzing") {
    S.mounted = null;
    const pct = Math.round((p.data.progress || 0) * 100);
    ed.innerHTML = `<div class="analyzing"><div class="drop-icon">👀</div>
      <div class="drop-title">Looking at your clip…</div>
      <div class="muted">Finding the loading screens, loud moments and big changes.</div>
      <div class="bar"><div id="analyze-bar" style="width:${pct}%"></div></div><div class="muted" id="analyze-pct">${pct}%</div></div>`;
    return;
  }
  if (p.data.status === "error") {
    S.mounted = null;
    ed.innerHTML = `<div class="analyzing"><div class="drop-icon">😵</div><div class="drop-title">That clip didn't work</div>
      <div class="muted">${esc(p.data.error)}</div><div><button class="btn primary" id="err-home" type="button">Try another clip</button></div></div>`;
    $("#err-home").onclick = showHome;
    return;
  }
  if (S.mounted !== p.id) mountProject();
  const name = $("#project-name");
  if (document.activeElement !== name) name.value = p.data.name;
  editChanged({ play: false });
}

/** Everything that shows the edit: steps, timeline, preview. */
async function editChanged({ play = false } = {}) {
  const p = S.project;
  if (!p || S.mounted !== p.id) return;
  $("#btn-undo").disabled = !p.canUndo;
  $("#btn-redo").disabled = !p.canRedo;
  const tl = p.timeline();
  $("#out-length").textContent = `· ${fmt(tl.duration)} video`;
  renderSteps();
  renderTimeline();
  renderExports();
  updateWatchButton();
  await S.overlays.prepare(p.plan);
  if (S.player && S.project === p) {
    S.player.setEdit(p.info, p.plan, tl, { restart: play });
    if (play) {
      setView("edited");
      S.player.play();
    }
  }
}

function mountProject() {
  const p = S.project;
  const ed = $("#editor");
  ed.innerHTML = "";
  ed.append($("#tpl-project").content.cloneNode(true));
  S.mounted = p.id;
  const orig = $("#vid-original");
  const src = $("#vid-source");
  orig.src = S.sourceUrl;
  src.src = S.sourceUrl;
  src.hidden = false;
  src.style.cssText = "position:absolute;width:2px;height:2px;opacity:0;pointer-events:none;left:0;top:0";
  S.player = new EditedPlayer({
    canvas: $("#edited-canvas"),
    video: src,
    bank: S.bank,
    overlays: S.overlays,
    onTime: (t) => {
      const scrub = $("#scrub");
      if (!scrub) return;
      const d = S.player ? S.player.duration : 0;
      if (!scrub.matches(":active")) scrub.value = d ? Math.round((t / d) * 1000) : 0;
      $("#edited-time").textContent = `${t.toFixed(1)} / ${d.toFixed(1)}s`;
    },
    onState: (playing) => {
      const b = $("#btn-play");
      if (b) {
        b.dataset.state = playing ? "playing" : "paused";
        b.setAttribute("aria-label", playing ? "Pause" : "Play");
      }
    },
  });
  document.querySelectorAll(".seg-btn").forEach((b) => { b.onclick = () => setView(b.dataset.view); });
  setView("edited");
  $("#project-name").onchange = (e) => {
    const name = e.target.value.replace(/\s+/g, " ").trim().slice(0, 40);
    if (name) {
      p.data.name = name;
      p.changed();
    }
  };
  $("#btn-play").onclick = () => S.player.toggle();
  $("#edited-canvas").onclick = () => S.player.toggle();
  $("#scrub").oninput = (e) => S.player.seek((Number(e.target.value) / 1000) * S.player.duration);
  $("#btn-mark").onclick = markHere;
  $("#btn-watch").onclick = watchClip;
  $("#btn-undo").onclick = () => undoRedo("undo");
  $("#btn-redo").onclick = () => undoRedo("redo");
  $("#btn-export").onclick = doExport;
  $("#btn-export-stop").onclick = () => S.exporting && S.exporting.abort();
  const tl = $("#timeline");
  let dragging = false;
  const seekFromEvent = (e) => {
    const r = tl.getBoundingClientRect();
    const t = clamp((e.clientX - r.left) / r.width, 0, 1) * S.project.info.duration;
    if (S.view !== "original") setView("original");
    orig.currentTime = t;
  };
  tl.onpointerdown = (e) => {
    if (e.target.closest(".tl-marker span")) return;
    dragging = true;
    tl.setPointerCapture(e.pointerId);
    seekFromEvent(e);
  };
  tl.onpointermove = (e) => { if (dragging) seekFromEvent(e); };
  tl.onpointerup = () => { dragging = false; };
}

function setView(view) {
  S.view = view;
  const canvas = $("#edited-canvas");
  const orig = $("#vid-original");
  if (!canvas) return;
  document.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  canvas.hidden = view !== "edited";
  $("#edited-controls").hidden = view !== "edited";
  orig.hidden = view !== "original";
  if (view === "edited") orig.pause();
  else if (S.player) S.player.pause();
}

function tickPlayhead() {
  requestAnimationFrame(tickPlayhead);
  const head = $("#tl-head");
  if (!head || !S.project || !S.mounted) return;
  const dur = S.project.info.duration;
  const t = currentClipTime();
  head.hidden = t === null;
  if (t !== null) {
    head.style.left = `${(clamp(t, 0, dur) / dur) * 100}%`;
    $("#tl-time").textContent = fmt(t);
  }
}

function updateWatchButton() {
  const b = $("#btn-watch");
  if (b) b.hidden = !(S.status && S.status.ready && S.status.vision);
}

// ------------------------------------------------------------------ timeline drawing
const FX_ICONS = { zoom: "🔍", shake: "📳", flash: "⚡", freeze: "🧊", sound: "🔊", text: "💬" };

function renderTimeline() {
  const p = S.project;
  const dur = p.info.duration;
  const plan = p.plan;
  const pct = (t) => `${(clamp(t, 0, dur) / dur) * 100}%`;
  const keep = plan.keep || { start: 0, end: dur };
  const at = (v) => (v === "start" ? keep.start : v === "end" ? keep.end : v);
  $("#tl-thumbs").style.backgroundImage = S.thumbsUrl ? `url(${S.thumbsUrl})` : "none";
  const layer = $("#tl-layer");
  layer.innerHTML = "";
  const box = (cls, a, b) => {
    const d = el(`<div class="${cls}"></div>`);
    d.style.left = pct(a);
    d.style.width = `${((clamp(b, 0, dur) - clamp(a, 0, dur)) / dur) * 100}%`;
    layer.append(d);
    return d;
  };
  ((p.analysis && p.analysis.moments) || []).forEach((m) => {
    if (m.end !== undefined) box("tl-dead", m.t, m.end).title = `${m.label} (${fmt(m.t)}–${fmt(m.end)})`;
    else if (m.kind === "loud" || m.kind === "change") {
      const d = el(`<div class="tl-moment ${m.kind}" title="${esc(m.label)} at ${fmt(m.t)}"></div>`);
      d.style.left = pct(m.t);
      layer.append(d);
    }
  });
  [[0, keep.start], [keep.end, dur], ...plan.remove.map((r) => [r.start, r.end])].forEach(([a, b]) => {
    if (b - a > 0.01) box("tl-cut", a, b).title = "Cut out";
  });
  plan.speed.forEach((s) => {
    box(`tl-speed ${s.factor < 1 ? "slow" : "fast"}`, s.start, s.end).title = `${s.factor < 1 ? "Slow-mo" : "Faster"} ${s.factor}x`;
  });
  const fx = [];
  ["zoom", "shake", "flash", "freeze", "sound", "text"].forEach((k) => plan[k].forEach((i) => fx.push([at(i.at), FX_ICONS[k]])));
  plan.sticker.forEach((i) => fx.push([at(i.at), i.emoji]));
  const used = {};
  fx.sort((a, b) => a[0] - b[0]).forEach(([t, icon]) => {
    const slot = Math.round((t / dur) * 60);
    used[slot] = (used[slot] || 0) + 1;
    if (used[slot] > 2) return;
    const d = el(`<div class="tl-fx">${esc(icon)}</div>`);
    d.style.left = `calc(${pct(t)} + ${(used[slot] - 1) * 14}px)`;
    layer.append(d);
  });
  p.data.markers.forEach((m) => {
    const d = el(`<div class="tl-marker"><span title="Click to remove">📍 ${esc(m.label)}</span></div>`);
    d.style.left = pct(m.t);
    $("span", d).onclick = (e) => {
      e.stopPropagation();
      p.deleteMarker(m.id);
      renderTimeline();
    };
    layer.append(d);
  });
}

// ------------------------------------------------------------------ steps, undo, markers
function renderSteps() {
  const p = S.project;
  const ul = $("#steps");
  ul.innerHTML = "";
  const all = P.steps(p.plan);
  const steps = all.filter((s) => s.id !== "format");
  const fmtStep = all.find((s) => s.id === "format");
  if (fmtStep) ul.append(stepItem(fmtStep, false));
  if (!steps.length) ul.append(el('<li class="empty">No edits yet: ask Beanie in the chat, or tap a button under the chat 👈</li>'));
  steps.forEach((s) => ul.append(stepItem(s, true)));
}

function stepItem(s, removable) {
  const li = el(`<li><span class="ico">${esc(s.icon)}</span><span class="txt" title="${esc(s.text)}">${esc(s.text)}</span></li>`);
  if (removable) {
    const x = el('<button type="button" title="Remove this step">✕</button>');
    x.onclick = () => {
      S.project.apply([{ do: "delete", id: s.id }], null, env());
      editChanged();
    };
    li.append(x);
  }
  return li;
}

function undoRedo(which) {
  const ok = which === "undo" ? S.project.undo() : S.project.redo();
  if (ok) editChanged();
}

function markHere() {
  const t = currentClipTime();
  if (t === null || !S.project) return;
  const m = S.project.addMarker(t, "steal");
  renderTimeline();
  toast(`📍 Marked the steal at ${fmt(m.t)}. Now say **make a W edit**!`);
}

async function watchClip() {
  const p = S.project;
  const btn = $("#btn-watch");
  if (!p || S.watching) return;
  S.watching = true;
  btn.disabled = true;
  if (S.player) S.player.pause();
  showStage("Beanie is watching your clip… 👀", 0);
  try {
    const a = p.analysis || {};
    const duration = p.info.duration;
    let lo = a.dead_start || 0;
    let hi = a.dead_end ?? duration;
    if (hi - lo < 1) [lo, hi] = [0, duration];
    const count = Math.round(Math.min(16, Math.max(6, (hi - lo) / 1.5)));
    const times = Array.from({ length: count }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / count);
    const frames = await grabFrames(S.source, times);
    const seen = await S.brain.watch(frames, { onProgress: (f) => showStage(`Beanie is watching your clip… ${Math.round(f * 100)}%`, f) });
    p.data.vision = seen;
    const [t, kind] = momentFromVision(seen);
    let reply;
    if (t !== null) {
      p.addMarker(t, kind);
      reply = `I watched your clip 👀 Looks like the ${kind} happens around ${fmt(t)}, so I marked it. `
        + 'Say "make a W edit" or "fail edit" and I\'ll use that moment.';
    } else {
      reply = "I watched your clip 👀 but couldn't spot the steal. Pause at it and press Mark.";
    }
    p.addChat("assistant", reply);
    renderChat();
    renderTimeline();
  } catch (e) {
    toast(`I couldn't watch it: ${e.message}`, 6000);
    S.brain.forget();
  } finally {
    S.watching = false;
    btn.disabled = false;
    hideStage();
  }
}

// ------------------------------------------------------------------ progress over the player
function showStage(text, value) {
  const o = $("#stage-overlay");
  if (!o) return;
  o.hidden = false;
  $("#stage-text").textContent = text;
  $("#stage-bar").style.width = `${Math.round((value || 0) * 100)}%`;
}

function hideStage() {
  const o = $("#stage-overlay");
  if (o) o.hidden = true;
}

// ------------------------------------------------------------------ export
async function doExport() {
  const p = S.project;
  if (S.exporting || !p) return;
  const ctrl = new AbortController();
  S.exporting = ctrl;
  if (S.player) S.player.pause();
  const btn = $("#btn-export");
  const box = $("#export-progress");
  btn.disabled = true;
  box.hidden = false;
  const show = (f, text) => {
    $("#export-bar").style.width = `${Math.round(f * 100)}%`;
    $("#export-text").textContent = text;
  };
  show(0, "Starting…");
  try {
    const counter = (await store.get("export_count").catch(() => 0)) || 0;
    const n = (await platform.lastExportNumber(counter)) + 1;
    const file = platform.exportName(n);
    const result = await exportVideo({
      source: S.source, info: p.info, plan: p.plan, overlays: S.overlays, bank: S.bank, onProgress: show, signal: ctrl.signal,
    });
    show(1, "Saving…");
    const download = await platform.saveVideo(result.blob, file);
    await store.set("export_count", n).catch(() => {});
    p.data.exports.push({
      file, duration: Math.round(result.duration * 100) / 100, time: Date.now() / 1000, download,
      width: result.width, height: result.height, video: result.codecs.video, audio: result.codecs.audio,
      size: result.blob.size,
    });
    p.data.exports = p.data.exports.slice(-20);
    p.changed();
    renderExports();
    const where = platform.isExtension ? "Downloads → Beanie Pro" : "your Downloads";
    toast(`✅ Saved **${file}** to ${where}${result.warnings.length ? `. ${result.warnings.join(" ")}` : ""}`, 7000);
  } catch (e) {
    if (e && e.name === "AbortError") toast("Export stopped.");
    else toast(`The export didn't finish: ${e.message}`, 7000);
  } finally {
    S.exporting = null;
    if ($("#btn-export")) {
      btn.disabled = false;
      box.hidden = true;
    }
  }
}

function renderExports() {
  const box = $("#exports");
  if (!box) return;
  box.innerHTML = "";
  (S.project.data.exports || []).slice().reverse().slice(0, 4).forEach((x) => {
    const card = el(`<div class="export-card"><span>🎉</span><span class="name" title="${esc(x.file)}">${esc(x.file)}</span>
      <span class="muted">${fmt(x.duration)}</span></div>`);
    if (platform.isExtension && x.download !== null && x.download !== undefined) {
      const b = el('<button class="btn small" type="button">📂 Show in folder</button>');
      b.onclick = async () => {
        if (!(await platform.downloadExists(x.download))) toast("That video isn't in your Downloads any more.");
        else platform.showDownload(x.download);
      };
      card.append(b);
    }
    box.append(card);
  });
}

// ------------------------------------------------------------------ windows (modals)
function openModal(html) {
  $("#modal").innerHTML = `<button class="btn tiny ghost close" type="button" aria-label="Close">✕</button>${html}`;
  $("#modal-back").hidden = false;
  $("#modal .close").onclick = closeModal;
  return $("#modal");
}

function closeModal() {
  $("#modal-back").hidden = true;
  $("#modal").innerHTML = "";
  if (S.playingSound) {
    try { S.playingSound.stop(); } catch (e) { /* done */ }
    S.playingSound = null;
  }
}

async function openSetup() {
  openModal('<h2>🧠 Beanie\'s AI brain</h2><p class="muted">Checking…</p>');
  await refreshStatus(true);
  renderSetup();
}

function chromeAiHtml(st) {
  const a = st.chrome.availability;
  if (a === "available") {
    return `<div>✅ Ready on this PC.${st.chrome.vision ? " It can watch your clips too." : ""}</div>`;
  }
  if (a === "downloadable" || a === "downloading") {
    return `<div class="muted">${a === "downloading" ? "Chrome is downloading it…" : "Chrome can download it for free (about 2 GB, one time). It needs about 22 GB of free disk space."}</div>
      <div class="row"><button class="btn primary" id="chrome-download" type="button">⬇️ ${a === "downloading" ? "Show download" : "Download Chrome AI"}</button></div>
      <div id="chrome-progress"></div>`;
  }
  if (a === "unavailable") {
    return `<div class="muted">Not available on this PC. Chrome's AI needs Windows 10/11 or a Mac, about 22 GB of free disk space,
      and a graphics card with more than 4 GB of memory (or 16 GB of RAM). Use Ollama below instead.</div>`;
  }
  return `<div class="muted">This Chrome doesn't have built-in AI yet. Update Chrome (⋮ menu → Help → About Google Chrome),
    restart it, then come back here.</div>`;
}

function ollamaHtml(st) {
  const o = st.ollama;
  const installed = new Set(o.models || []);
  const rows = RECOMMENDED_MODELS.map((m) => {
    const has = installed.has(m.name);
    const inUse = has && o.model === m.name;
    const action = inUse ? '<span class="pill ok">In use ✓</span>'
      : has ? `<button class="btn small" data-use="${esc(m.name)}" type="button">Use this</button>`
        : `<button class="btn small primary" data-pull="${esc(m.name)}" type="button" ${o.online ? "" : "disabled"}>Download</button>`;
    return `<div class="model-row"><div class="grow"><b>${esc(m.name)}</b> <span class="muted">${esc(m.size)}</span>
      <small>${esc(m.note)}</small></div>${action}</div>`;
  }).join("");
  const others = (o.models || []).filter((n) => !RECOMMENDED_MODELS.some((m) => m.name === n));
  const otherRows = others.map((n) => `<div class="model-row"><div class="grow"><b>${esc(n)}</b></div>${
    o.model === n ? '<span class="pill ok">In use ✓</span>' : `<button class="btn small" data-use="${esc(n)}" type="button">Use this</button>`}</div>`).join("");
  return `
    <div class="row" style="margin-top:6px">${o.online ? `✅ Ollama is running (version ${esc(o.version)}).`
      : `<span class="muted">1. Install Ollama, open it once, then press <b>Check again</b>.</span>`}</div>
    ${o.online ? "" : `<div class="row"><a class="btn primary" href="https://ollama.com/download" target="_blank" rel="noopener">⬇️ Get Ollama (free)</a>
      <button class="btn" id="setup-recheck" type="button">🔄 Check again</button></div>`}
    <div class="note">${o.online ? "" : "2. "}Pick a brain. Bigger = smarter but slower. <b>gemma3:4b</b> is the best for most PCs.</div>
    ${rows}${otherRows}
    <details style="margin-top:10px"><summary class="muted">Use another model</summary>
      <div class="row"><input class="text-input" id="custom-model" placeholder="model name, e.g. qwen2.5:7b">
      <button class="btn small" id="custom-pull" type="button" ${o.online ? "" : "disabled"}>Download + use</button></div></details>
    <div id="pull-progress"></div>`;
}

function renderSetup(message = "") {
  const st = S.status;
  if (!st) return;
  const set = S.settings;
  const choice = (value, label) => `<label><input type="radio" name="brain-choice" value="${value}" ${set.brain === value ? "checked" : ""}>${label}</label>`;
  const m = openModal(`
    <h2>🧠 Beanie's AI brain</h2>
    <p class="muted">Beanie's brain runs on <b>your PC</b>: nothing you say or edit leaves your computer. Set up one of these.</p>
    ${message ? `<div class="step-box done">${message}</div>` : ""}
    <div class="step-box ${st.chrome.availability === "available" ? "done" : ""} ${st.mode === "chrome" ? "chosen" : ""}">
      <b>⚡ Chrome's built-in AI</b> <span class="muted">· easiest, nothing to install</span>
      ${chromeAiHtml(st)}
    </div>
    <div class="step-box ${st.ollama.ready ? "done" : ""} ${st.mode === "ollama" ? "chosen" : ""}">
      <b>🦙 Ollama</b> <span class="muted">· a free app, smarter models, can watch your clips</span>
      ${ollamaHtml(st)}
    </div>
    <h3>Settings</h3>
    <div>Which brain Beanie uses:</div>
    <div class="choice">${choice("auto", "Best available")}${choice("chrome", "Chrome AI")}${choice("ollama", "Ollama")}${choice("basic", "Basic mode (no AI)")}</div>
    <label class="switch"><input type="checkbox" id="set-instant" ${set.instant_commands ? "checked" : ""}>
      Do clear commands instantly ("cut 0 to 3", "skull at the end") without waiting for the AI</label>
    <details style="margin-top:10px"><summary class="muted">Advanced</summary>
      <div class="row"><span>Ollama address</span><input class="text-input" id="set-url" value="${esc(set.ollama_url)}">
      <button class="btn small" id="set-url-save" type="button">Save</button></div></details>
  `);
  m.querySelectorAll("[data-pull]").forEach((b) => { b.onclick = () => pullModel(b.dataset.pull); });
  m.querySelectorAll("[data-use]").forEach((b) => { b.onclick = () => changeSettings({ model: b.dataset.use }); });
  m.querySelectorAll('input[name="brain-choice"]').forEach((r) => { r.onchange = () => changeSettings({ brain: r.value }); });
  const recheck = $("#setup-recheck");
  if (recheck) recheck.onclick = openSetup;
  const download = $("#chrome-download");
  if (download) download.onclick = downloadChromeAI;
  $("#custom-pull").onclick = () => {
    const v = $("#custom-model").value.trim();
    if (/^[\w.:/-]{1,80}$/.test(v)) pullModel(v);
    else toast("That model name doesn't look right.");
  };
  $("#set-instant").onchange = (e) => changeSettings({ instant_commands: e.target.checked }, false);
  $("#set-url-save").onclick = () => {
    const url = $("#set-url").value.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
      toast("Ollama must be on this PC, like http://127.0.0.1:11434");
      return;
    }
    changeSettings({ ollama_url: url });
  };
}

async function changeSettings(changes, rerender = true) {
  Object.assign(S.settings, changes);
  await saveSettings(S.settings);
  S.brain.forget();
  await refreshStatus(true);
  if (rerender && !$("#modal-back").hidden) renderSetup();
}

async function downloadChromeAI() {
  const box = $("#chrome-progress");
  const btn = $("#chrome-download");
  btn.disabled = true;
  const show = (frac) => {
    box.innerHTML = `<div style="margin-top:10px">Downloading Chrome's AI… ${Math.round(frac * 100)}%</div>
      <div class="bar" style="margin-top:6px"><div style="width:${Math.round(frac * 100)}%"></div></div>`;
  };
  show(0);
  try {
    await S.brain.chromeAI.download(show);
    S.brain.forget();
    await refreshStatus(true);
    renderSetup("✅ Chrome's AI is ready! Close this and start chatting.");
  } catch (e) {
    box.innerHTML = `<div style="margin-top:10px;color:#ffb4b4">⚠ ${esc(e.message)}</div>`;
    btn.disabled = false;
  }
}

async function pullModel(name) {
  const box = $("#pull-progress");
  const show = (text, frac) => {
    box.innerHTML = `<div style="margin-top:10px">${esc(text)}</div>`
      + (frac !== null ? `<div class="bar" style="margin-top:6px"><div style="width:${Math.round(frac * 100)}%"></div></div>` : "");
  };
  document.querySelectorAll("[data-pull],[data-use],#custom-pull").forEach((b) => { b.disabled = true; });
  show(`Downloading ${name}… (this can take a while: it's a few GB)`, 0);
  try {
    for await (const ev of S.brain.ollama.pull(name)) {
      const frac = ev.total ? ev.completed / ev.total : null;
      const gb = ev.total ? ` ${(ev.completed / 1e9).toFixed(2)} / ${(ev.total / 1e9).toFixed(2)} GB` : "";
      show(`${name}: ${ev.status || "working"}${gb}`, frac);
    }
    Object.assign(S.settings, { model: name });
    await saveSettings(S.settings);
    S.brain.forget();
    await refreshStatus(true);
    renderSetup(`✅ ${esc(name)} is ready! Close this and start chatting.`);
  } catch (e) {
    await refreshStatus(true);
    renderSetup(`<span style="color:#ffb4b4">⚠ ${esc(e.message || "The download stopped.")}</span>`);
  }
}

async function playSound(name) {
  if (!S.previewAudio) S.previewAudio = new AudioContext();
  if (S.previewAudio.state === "suspended") await S.previewAudio.resume();
  if (S.playingSound) {
    try { S.playingSound.stop(); } catch (e) { /* done */ }
  }
  const buf = await S.bank.get(name);
  if (!buf) return;
  const src = S.previewAudio.createBufferSource();
  src.buffer = buf;
  src.connect(S.previewAudio.destination);
  src.start();
  S.playingSound = src;
}

async function addUserSounds(files, kind) {
  let added = 0;
  for (const f of files) {
    const name = cleanName(f.name);
    let seconds;
    try {
      const ctx = new OfflineAudioContext(1, 1, 48000);
      seconds = (await ctx.decodeAudioData(await f.arrayBuffer())).duration;
    } catch (e) {
      toast(`${f.name} isn't a sound file I can play.`);
      continue;
    }
    if (kind === "sound" && seconds > 30) {
      toast(`${f.name} is ${Math.round(seconds)} s long. Sound effects must be under 30 s: add it as music instead.`, 6000);
      continue;
    }
    await store.putSound({ name, kind, blob: f, seconds, added: Date.now() / 1000, file: f.name });
    added += 1;
  }
  S.bank.setUser(await store.listSounds());
  openSounds();
  if (added) toast(`Added ${added} ${kind === "music" ? "song" : "sound"}${added > 1 ? "s" : ""}. Ask for ${added > 1 ? "them" : "it"} by name!`);
}

function openSounds() {
  const canAdd = Boolean(S.project && S.project.ready && S.mounted);
  const row = (name, about, removable) => `<div class="sound-row">
      <button class="btn tiny" data-play="${esc(name)}" type="button" title="Play">▶</button>
      <div class="grow"><b>${esc(name)}</b><small>${esc(about)}</small></div>
      ${canAdd && about !== "song" ? `<button class="btn tiny ghost" data-add="${esc(name)}" type="button" title="Add at the moment you're watching">+ here</button>` : ""}
      ${removable ? `<button class="btn tiny ghost" data-del="${esc(name)}" type="button" title="Remove">✕</button>` : ""}
    </div>`;
  const builtIn = Object.entries(BUILTIN).map(([name, s]) => row(name, s.about, false)).join("");
  const mine = S.bank.userNames("sound").map((n) => row(n, "your own sound", true)).join("");
  const songs = S.bank.userNames("music").map((n) => row(n, "song", true)).join("");
  const m = openModal(`<h2>🔊 Sounds</h2>
    <p class="muted">Beanie can drop these on any moment. Just say it: <b>"boom at 6"</b>, <b>"sad trombone at the end"</b>.</p>
    <div class="sound-list">${builtIn}</div>
    <h3>My sounds</h3>
    <div class="sound-list">${mine || '<span class="muted">Add your own sound effects (like a vine boom) and ask for them by name.</span>'}</div>
    <div class="row"><label class="btn small">＋ Add sound files<input type="file" id="add-sounds" accept="audio/*" multiple hidden></label></div>
    <h3>My music</h3>
    <div class="sound-list">${songs || '<span class="muted">Add songs, then say <b>"add the song …"</b>.</span>'}</div>
    <div class="row"><label class="btn small">＋ Add songs<input type="file" id="add-music" accept="audio/*" multiple hidden></label></div>`);
  m.querySelectorAll("[data-play]").forEach((b) => {
    b.onclick = () => playSound(b.dataset.play).catch((e) => toast(e.message));
  });
  m.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      await store.deleteSound(b.dataset.del);
      S.bank.setUser(await store.listSounds());
      openSounds();
    };
  });
  m.querySelectorAll("[data-add]").forEach((b) => {
    b.onclick = async () => {
      closeModal();
      const t = currentClipTime();
      const result = S.project.apply([{ do: "sound", name: b.dataset.add, at: t === null ? "start" : Number(t.toFixed(2)) }], null, env());
      if (result.done.length) S.project.addChat("assistant", instantReply(result), result.done, result.warnings);
      renderChat();
      await editChanged();
    };
  });
  $("#add-sounds").onchange = (e) => addUserSounds([...e.target.files], "sound");
  $("#add-music").onchange = (e) => addUserSounds([...e.target.files], "music");
}

async function openClips() {
  openModal("<h2>🎬 My clips</h2><p class='muted'>Loading…</p>");
  const projects = (await store.listProjects().catch(() => [])).sort((a, b) => b.created - a.created);
  const rows = projects.map((p) => `<div class="clip-row" data-id="${esc(p.id)}">
      <span>🎞️</span><div class="grow"><b>${esc(p.name)}</b><div class="muted">${fmt(p.info.duration)} · ${timeAgo(p.created)}${
  p.exports && p.exports.length ? ` · ${p.exports.length} export(s)` : ""}</div></div>
      <button class="btn tiny ghost danger" data-del="${esc(p.id)}" type="button" title="Delete this clip from Beanie">🗑</button></div>`).join("");
  const m = openModal(`<h2>🎬 My clips</h2>
    <div class="row"><button class="btn primary small" id="new-clip" type="button">＋ Add a new clip</button></div>
    <div class="clip-list">${rows || '<p class="muted">No clips yet.</p>'}</div>
    <p class="muted" style="margin-top:12px">Deleting a clip here doesn't touch your recordings or exported videos.</p>`);
  $("#new-clip").onclick = () => {
    closeModal();
    showHome();
  };
  m.querySelectorAll(".clip-row").forEach((r) => {
    r.onclick = (e) => {
      if (e.target.closest("[data-del]")) return;
      closeModal();
      openProject(r.dataset.id);
    };
  });
  m.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      if (!window.confirm("Delete this clip from Beanie? (Your original recording stays.)")) return;
      if (S.project && S.project.id === b.dataset.del) await showHome();
      await store.deleteProject(b.dataset.del);
      openClips();
    };
  });
}

// ------------------------------------------------------------------ start
async function boot() {
  $("#composer").onsubmit = (e) => {
    e.preventDefault();
    send();
  };
  const input = $("#input");
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  $("#btn-setup").onclick = openSetup;
  $("#brain-pill").onclick = openSetup;
  $("#btn-sounds").onclick = openSounds;
  $("#btn-clips").onclick = openClips;
  $("#modal-back").onclick = (e) => { if (e.target.id === "modal-back") closeModal(); };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#modal-back").hidden) closeModal();
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (typing || !S.mounted || !$("#modal-back").hidden) return;
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      markHere();
    }
    if (e.key === " ") {
      e.preventDefault();
      if (S.view === "edited") S.player.toggle();
      else {
        const v = $("#vid-original");
        if (v.paused) v.play().catch(() => {});
        else v.pause();
      }
    }
  });
  // drop a video anywhere
  document.addEventListener("dragover", (e) => {
    e.preventDefault();
    const d = $("#drop");
    if (d) d.classList.add("over");
  });
  document.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget) {
      const d = $("#drop");
      if (d) d.classList.remove("over");
    }
  });
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    const d = $("#drop");
    if (d) d.classList.remove("over");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) importFile(file);
  });
  window.addEventListener("pagehide", () => {
    if (S.project) store.putProject(S.project.data).catch(() => {});
  });

  S.settings = await loadSettings();
  S.brain = new Brain(S.settings);
  await platform.allowOllama().catch(() => {});
  S.bank.setUser(await store.listSounds().catch(() => []));
  S.lobby = (await store.get("lobby").catch(() => null)) || [];
  requestAnimationFrame(tickPlayhead);
  renderChat();
  refreshStatus();
  const last = await store.get("last_project").catch(() => null);
  if (last) await openProject(last);
  else await showHome();
  setInterval(() => refreshStatus(), 15000);
  window.addEventListener("focus", () => refreshStatus());
  document.body.dataset.ready = "1";
}

boot().catch((e) => {
  console.error(e);
  toast(`Beanie couldn't start: ${e.message}`, 10000);
});
