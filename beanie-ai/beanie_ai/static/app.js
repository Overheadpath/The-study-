"use strict";
/* Beanie AI - the app screen. Talks to the local server (server.py). */

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

function remember(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (_) { /* private mode: fine */ }
  return null;
}

let toastTimer = null;
function toast(text, ms = 3500) {
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

// ------------------------------------------------------------------ talking to the server
const API = {
  headers: { "X-Beanie": "1" },
  async check(r) {
    if (r.ok) return r;
    let msg = `Error ${r.status}`;
    try { msg = (await r.json()).error || msg; } catch (_) { /* not JSON */ }
    throw new Error(msg);
  },
  async get(path) {
    const r = await this.check(await fetch(path, { cache: "no-store" }));
    return r.json();
  },
  async post(path, body) {
    const r = await this.check(await fetch(path, {
      method: "POST", headers: { ...this.headers, "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
    }));
    return r.json();
  },
  async png(path, blob) {
    await this.check(await fetch(path, { method: "POST", headers: { ...this.headers, "Content-Type": "image/png" }, body: blob }));
  },
  /** POST and read the answer line by line (NDJSON). Returns the last event. */
  async stream(path, body, onEvent) {
    const r = await this.check(await fetch(path, {
      method: "POST", headers: { ...this.headers, "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
    }));
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let last = null;
    const take = (line) => {
      if (!line.trim()) return;
      last = JSON.parse(line);
      onEvent && onEvent(last);
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        take(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    }
    take(buf);
    return last;
  },
  upload(file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/projects/upload");
      xhr.setRequestHeader("X-Beanie", "1");
      xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (_) { /* ignore */ }
        if (xhr.status === 200) resolve(data);
        else reject(new Error(data.error || `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("Upload failed. Is Beanie AI still running?"));
      xhr.send(file);
    });
  },
};

// ------------------------------------------------------------------ app state
const S = {
  status: null,        // /api/status
  project: null,       // the open clip
  mounted: null,       // id of the clip shown in the editor
  view: "edited",
  chatBusy: false,
  previewSeq: 0,       // newest preview request
  previewTimer: null,
  exporting: false,
  pollTimer: null,
  shownPreview: null,  // preview file in the player
};

// ------------------------------------------------------------------ header + status
async function loadStatus(fresh = false) {
  try {
    S.status = await API.get(`/api/status${fresh ? "?fresh=1" : ""}`);
  } catch (_) {
    $("#brain-pill").textContent = "⚠️ Beanie AI isn't running";
    $("#brain-pill").className = "pill warn";
    return;
  }
  renderHeader();
  if (!S.project) renderChat();
}

function renderHeader() {
  const b = S.status && S.status.brain;
  const pill = $("#brain-pill");
  const setup = $("#btn-setup");
  if (!b) return;
  if (b.ready) {
    pill.className = "pill ok";
    pill.textContent = `🧠 AI ready · ${b.model}`;
    setup.textContent = "AI settings";
    setup.className = "btn ghost small";
  } else {
    pill.className = "pill warn";
    pill.textContent = b.online ? "🧠 Brain not downloaded" : "🧠 Basic mode";
    pill.title = "Simple commands work now. Set up the AI for full chat.";
    setup.textContent = "Set up AI";
    setup.className = "btn primary small";
  }
}

// ------------------------------------------------------------------ chat
function greeting() {
  if (!S.project) {
    return "Hey, I'm **Beanie** 👋 your AI video editor. I run right here on your PC.\n\n" +
      "Add a clip on the right (drop it in, or pick a recent recording), then tell me how to edit it: " +
      "\"make a W edit\", \"fail edit with a skull\", \"cut the loading screen\"…";
  }
  const p = S.project;
  if (p.status === "analyzing") return "Looking at your clip… 👀";
  if (p.status === "error") return p.error || "That clip didn't work.";
  const a = p.analysis || {};
  const parts = [`Got your clip! It's ${fmt(p.info.duration)} long.`];
  if (a.dead_start) parts.push(`The first ${fmt(a.dead_start)} look like loading.`);
  if (a.highlight != null) parts.push(`My guess for the big moment: **${fmt(a.highlight)}**.`);
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
  items.forEach((li, i) => { if (i >= SHOW) li.hidden = true; ul.append(li); });
  if (items.length > SHOW) {
    const more = el(`<button class="more-done" type="button">+${items.length - SHOW} more</button>`);
    more.onclick = () => { items.forEach((li) => { li.hidden = false; }); more.remove(); };
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
  const msgs = S.project ? S.project.chat : ((S.status && S.status.lobby) || []);
  msgs.forEach((m) => addBubble(m.role, m.content, m.done, m.warnings));
  scrollChat();
  renderChips();
}

function renderChips() {
  const box = $("#chips");
  box.innerHTML = "";
  let chips;
  if (!S.project) {
    chips = [["🎥 How do I record?", "How do I record my steals?"], ["🤔 What can you do?", "What can you do?"]];
  } else if (S.project.status !== "ready") {
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

function playerTime() {
  const v = S.view === "edited" ? $("#vid-edited") : $("#vid-original");
  return v && isFinite(v.currentTime) ? v.currentTime : null;
}

async function send(textArg) {
  const input = $("#input");
  const text = (textArg ?? input.value).trim();
  if (!text || S.chatBusy) return;
  if (S.project && S.project.status === "analyzing") {
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
  try {
    const path = S.project ? `/api/projects/${S.project.id}/chat` : "/api/lobby/chat";
    const last = await API.stream(path, { message: text, now: playerTime(), view: S.view }, (ev) => {
      if (ev.type === "text") {
        streamed += ev.text;
        bubble.innerHTML = md(streamed);
        scrollChat();
      }
    });
    if (!last) throw new Error("No answer.");
    if (last.type === "done") {
      bubble.innerHTML = md(last.reply);
      if (last.streamed) addDoneList(bubble, last.done, last.warnings);
      if (last.project) applyState(last.project);
      if (!S.project && S.status) S.status.lobby = (S.status.lobby || []).concat(
        [{ role: "user", content: text }, { role: "assistant", content: last.reply }]);
    } else {
      bubble.closest(".msg").className = "msg system";
      bubble.innerHTML = md(last.message || "Something went wrong.");
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
}

function autosize() {
  const t = $("#input");
  t.style.height = "auto";
  t.style.height = `${Math.min(140, t.scrollHeight)}px`;
}

// ------------------------------------------------------------------ home (import) screen
async function showHome() {
  clearTimeout(S.pollTimer);
  S.project = null;
  S.mounted = null;
  remember("beanie.project", null);
  const ed = $("#editor");
  ed.innerHTML = "";
  ed.append($("#tpl-import").content.cloneNode(true));
  $("#file").onchange = (e) => uploadFile(e.target.files[0]);
  $("#recent-refresh").onclick = loadRecent;
  renderChat();
  loadRecent();
}

async function loadRecent() {
  const grid = $("#recent-grid");
  if (!grid) return;
  try {
    const { clips } = await API.get("/api/recent");
    grid.innerHTML = "";
    if (!clips.length) {
      grid.append(el('<div class="muted">No recordings found yet. Record with <kbd>Win</kbd> + <kbd>Alt</kbd> + <kbd>R</kbd>, or drop a video above.</div>'));
      return;
    }
    clips.forEach((c) => {
      const card = el(`<button class="clip-card" type="button">
        <img loading="lazy" alt="" src="/api/recent/thumb?path=${encodeURIComponent(c.path)}">
        <div class="meta"><b>${esc(c.name)}</b><span class="muted">${timeAgo(c.mtime)} · ${(c.size / 1048576).toFixed(0)} MB</span></div>
      </button>`);
      card.onclick = () => importPath(c.path, card);
      grid.append(card);
    });
  } catch (e) {
    grid.innerHTML = `<div class="muted">${esc(e.message)}</div>`;
  }
}

async function importPath(path, card) {
  if (card) card.disabled = true;
  try {
    const { project } = await API.post("/api/projects/import", { path });
    openProject(project.id, project);
  } catch (e) {
    toast(e.message);
    if (card) card.disabled = false;
  }
}

async function uploadFile(file) {
  if (!file) return;
  if (!/^video\//.test(file.type) && !/\.(mp4|mov|mkv|webm|avi|m4v|wmv|flv|ts)$/i.test(file.name)) {
    toast("That doesn't look like a video file.");
    return;
  }
  if (S.mounted) await showHome();
  const bar = $(".upload-bar");
  if (bar) bar.hidden = false;
  try {
    const { project } = await API.upload(file, (f) => { if (bar) bar.firstElementChild.style.width = `${f * 100}%`; });
    openProject(project.id, project);
  } catch (e) {
    toast(e.message);
    if (bar) bar.hidden = true;
  }
}

// ------------------------------------------------------------------ opening a clip
async function openProject(id, state) {
  clearTimeout(S.pollTimer);
  try {
    if (!state) state = (await API.get(`/api/projects/${id}`)).project;
  } catch (e) {
    remember("beanie.project", null);
    return showHome();
  }
  remember("beanie.project", id);
  S.project = state;
  S.mounted = null;
  S.shownPreview = null;
  renderProject();
  renderChat();
  if (state.status === "analyzing") pollProject(id);
}

async function pollProject(id) {
  clearTimeout(S.pollTimer);
  try {
    const { project } = await API.get(`/api/projects/${id}`);
    if (!S.project || S.project.id !== id) return;
    const wasAnalyzing = S.project.status === "analyzing";
    S.project = project;
    renderProject();
    if (project.status === "analyzing") {
      S.pollTimer = setTimeout(() => pollProject(id), 400);
    } else if (wasAnalyzing) {
      renderChat();
    }
  } catch (_) {
    S.pollTimer = setTimeout(() => pollProject(id), 1500);
  }
}

function applyState(state) {
  if (!S.project || state.id !== S.project.id) return;
  if (state.plan_version !== S.project.plan_version) S.showNextPreview = true;  // an edit: show its result
  S.project = state;
  renderProject();
}

// ------------------------------------------------------------------ the editor
function renderProject() {
  const p = S.project;
  const ed = $("#editor");
  if (!p) return showHome();
  if (p.status === "analyzing") {
    S.mounted = null;
    const pct = Math.round((p.progress || 0) * 100);
    ed.innerHTML = `<div class="analyzing"><div class="drop-icon">👀</div>
      <div class="drop-title">Looking at your clip…</div>
      <div class="muted">Making a preview copy and finding the loading screens, loud moments and big changes.</div>
      <div class="bar"><div style="width:${pct}%"></div></div><div class="muted">${pct}%</div></div>`;
    return;
  }
  if (p.status === "error") {
    S.mounted = null;
    ed.innerHTML = `<div class="analyzing"><div class="drop-icon">😵</div><div class="drop-title">That clip didn't work</div>
      <div class="muted">${esc(p.error)}</div><div><button class="btn primary" id="err-home">Try another clip</button></div></div>`;
    $("#err-home").onclick = showHome;
    return;
  }
  if (S.mounted !== p.id) mountProject();
  const name = $("#project-name");
  if (document.activeElement !== name) name.value = p.name;
  $("#btn-undo").disabled = !p.can_undo;
  $("#btn-redo").disabled = !p.can_redo;
  $("#out-length").textContent = p.output_duration ? `· ${fmt(p.output_duration)} video` : "";
  const b = S.status && S.status.brain;
  $("#btn-watch").hidden = !(b && b.ready && b.vision);
  renderSteps();
  renderTimeline();
  renderExports();
  updatePreviewPlayer();
  schedulePreview();
}

function mountProject() {
  const p = S.project;
  const ed = $("#editor");
  ed.innerHTML = "";
  ed.append($("#tpl-project").content.cloneNode(true));
  S.mounted = p.id;
  const orig = $("#vid-original");
  orig.poster = `/api/projects/${p.id}/media/poster`;
  orig.src = `/api/projects/${p.id}/media/source`;
  document.querySelectorAll(".seg-btn").forEach((b) => { b.onclick = () => setView(b.dataset.view); });
  setView(p.preview ? "edited" : "original");
  $("#project-name").onchange = async (e) => {
    try { applyState((await API.post(`/api/projects/${p.id}/rename`, { name: e.target.value })).project); } catch (err) { toast(err.message); }
  };
  $("#btn-mark").onclick = markHere;
  $("#btn-watch").onclick = watchClip;
  $("#btn-undo").onclick = () => undoRedo("undo");
  $("#btn-redo").onclick = () => undoRedo("redo");
  $("#btn-export").onclick = exportVideo;
  $("#stale-badge").onclick = () => runPreview();
  $("#stage-badge").onclick = () => setView("edited");
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
  const ed = $("#vid-edited");
  const og = $("#vid-original");
  if (!ed) return;
  document.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  ed.hidden = view !== "edited";
  og.hidden = view !== "original";
  (view === "edited" ? og : ed).pause();
  updateStale();
  drawStage();
}

function updatePreviewPlayer() {
  const p = S.project;
  const v = $("#vid-edited");
  if (!v || !p.preview) return;
  if (S.shownPreview !== p.preview.file) {
    S.shownPreview = p.preview.file;
    const v_ = encodeURIComponent(p.preview.file);
    v.poster = p.preview.poster ? `/api/projects/${p.id}/media/preview_poster?v=${v_}` : "";
    v.src = `/api/projects/${p.id}/media/preview?v=${v_}`;
  }
  updateStale();
}

/** Show the new preview after a change. */
function playPreview() {
  const v = $("#vid-edited");
  if (!v) return;
  setView("edited");
  v.play().catch(() => { /* the browser may block autoplay: fine */ });
}

function updateStale() {
  const badge = $("#stale-badge");
  if (!badge || !S.project) return;
  const autoPreview = S.status && S.status.settings && S.status.settings.auto_preview;
  badge.hidden = !(S.project.preview_stale && S.view === "edited" && !autoPreview && S.project.preview);
}

function tickPlayhead() {
  requestAnimationFrame(tickPlayhead);
  const head = $("#tl-head");
  if (!head || !S.project || !S.project.info) return;
  const dur = S.project.info.duration;
  let t = null;
  if (S.view === "original") {
    t = $("#vid-original").currentTime;
  } else {
    const v = $("#vid-edited");
    if (v && v.src && !S.project.preview_stale) t = toClipTime(v.currentTime);
  }
  head.hidden = t == null;
  if (t != null) {
    head.style.left = `${(clamp(t, 0, dur) / dur) * 100}%`;
    $("#tl-time").textContent = fmt(t);
  }
}

/** Edited-video time -> clip time, using the plan's segments. */
function toClipTime(tOut) {
  for (const s of S.project.segments || []) {
    if (tOut >= s.out_start - 1e-6 && tOut <= s.out_end + 1e-6) {
      return s.kind === "freeze" ? s.src_at : s.src_start + (tOut - s.out_start) * s.speed;
    }
  }
  return null;
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
  $("#tl-thumbs").style.backgroundImage = `url(/api/projects/${p.id}/media/thumbs)`;
  const layer = $("#tl-layer");
  layer.innerHTML = "";
  const box = (cls, a, b) => {
    const d = el(`<div class="${cls}"></div>`);
    d.style.left = pct(a);
    d.style.width = `${((clamp(b, 0, dur) - clamp(a, 0, dur)) / dur) * 100}%`;
    layer.append(d);
    return d;
  };
  (p.analysis.moments || []).forEach((m) => {
    if (m.end != null) box("tl-dead", m.t, m.end).title = `${m.label} (${fmt(m.t)}–${fmt(m.end)})`;
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
  p.markers.forEach((m) => {
    const d = el(`<div class="tl-marker"><span title="Click to remove">📍 ${esc(m.label)}</span></div>`);
    d.style.left = pct(m.t);
    $("span", d).onclick = async (e) => {
      e.stopPropagation();
      try { applyState((await API.post(`/api/projects/${p.id}/markers/delete`, { id: m.id })).project); } catch (err) { toast(err.message); }
    };
    layer.append(d);
  });
}

// ------------------------------------------------------------------ steps, undo, markers
function renderSteps() {
  const p = S.project;
  const ul = $("#steps");
  ul.innerHTML = "";
  const steps = p.steps.filter((s) => s.id !== "format");
  const fmtStep = p.steps.find((s) => s.id === "format");
  if (fmtStep) ul.append(stepItem(fmtStep, false));
  if (!steps.length) {
    ul.append(el('<li class="empty">No edits yet: ask Beanie in the chat, or tap a button under the chat 👈</li>'));
  }
  steps.forEach((s) => ul.append(stepItem(s, true)));
}

function stepItem(s, removable) {
  const li = el(`<li><span class="ico">${esc(s.icon)}</span><span class="txt" title="${esc(s.text)}">${esc(s.text)}</span></li>`);
  if (removable) {
    const x = el('<button type="button" title="Remove this step">✕</button>');
    x.onclick = async () => {
      try {
        applyState((await API.post(`/api/projects/${S.project.id}/actions`, { actions: [{ do: "delete", id: s.id }] })).project);
      } catch (e) { toast(e.message); }
    };
    li.append(x);
  }
  return li;
}

async function undoRedo(which) {
  try { applyState((await API.post(`/api/projects/${S.project.id}/${which}`)).project); } catch (e) { toast(e.message); }
}

async function markHere() {
  const t = playerTime();
  if (t == null) return;
  try {
    const before = new Set(S.project.markers.map((m) => m.id));
    const { project } = await API.post(`/api/projects/${S.project.id}/markers`, { t, view: S.view, label: "steal" });
    applyState(project);
    const added = project.markers.find((m) => !before.has(m.id));
    toast(`📍 Marked the steal at ${fmt(added ? added.t : t)}. Now say **make a W edit**!`);
  } catch (e) { toast(e.message); }
}

async function watchClip() {
  const btn = $("#btn-watch");
  btn.disabled = true;
  S.watching = true;
  S.previewSeq++;
  showStage("Beanie is watching your clip… 👀", 0);
  try {
    const last = await API.stream(`/api/projects/${S.project.id}/watch`, {}, (ev) => {
      if (ev.type === "progress") showStage(`Beanie is watching your clip… ${Math.round(ev.value * 100)}%`, ev.value);
    });
    if (last && last.type === "done") {
      applyState(last.project);
      renderChat();
    } else if (last) toast(last.message || "That didn't work.");
  } catch (e) { toast(e.message); } finally {
    S.watching = false;
    btn.disabled = false;
    hideStage();
    schedulePreview();
  }
}

// ------------------------------------------------------------------ previews + export
const stage = { text: null, value: 0 };

/** Progress over the player. While you watch the original clip it's a small badge instead. */
function showStage(text, value) {
  stage.text = text;
  stage.value = value || 0;
  drawStage();
}

function hideStage() {
  stage.text = null;
  drawStage();
}

function drawStage() {
  const o = $("#stage-overlay");
  const badge = $("#stage-badge");
  if (!o) return;
  const busy = stage.text != null;
  o.hidden = !busy || S.view !== "edited";
  badge.hidden = !busy || S.view === "edited";
  if (!busy) return;
  $("#stage-text").textContent = stage.text;
  $("#stage-bar").style.width = `${Math.round(stage.value * 100)}%`;
  $("#stage-badge-text").textContent = stage.text;
}

function schedulePreview(delay = 300) {
  const p = S.project;
  if (!p || p.status !== "ready" || !p.preview_stale || S.watching || S.exporting) return;
  const auto = !S.status || !S.status.settings || S.status.settings.auto_preview;
  if (!auto && p.preview) return;
  clearTimeout(S.previewTimer);
  S.previewTimer = setTimeout(runPreview, delay);
}

async function runPreview() {
  const p = S.project;
  if (!p || S.exporting) return;
  const seq = ++S.previewSeq;
  showStage("Making preview…", 0);
  try {
    await ensureOverlays();
    let last = await API.stream(`/api/projects/${p.id}/render`, { quality: "preview" }, (ev) => {
      if (ev.type === "progress" && seq === S.previewSeq) showStage(`Making preview… ${Math.round(ev.value * 100)}%`, ev.value);
    });
    if (seq !== S.previewSeq) return;
    if (last && last.type === "need_overlays") {
      await ensureOverlays(last.overlays);
      last = await API.stream(`/api/projects/${p.id}/render`, { quality: "preview" }, () => {});
    }
    if (seq !== S.previewSeq) return;
    if (last && last.type === "done") {
      applyState(last.project);
      if (S.showNextPreview && !S.project.preview_stale) {
        S.showNextPreview = false;
        playPreview();
      }
    } else if (last && last.type === "busy") {
      schedulePreview(3000);  // something bigger is running (export, watching): try again soon
    } else if (last && last.type === "error") toast(`Preview problem: ${last.message}`, 6000);
  } catch (e) {
    if (seq === S.previewSeq) toast(`Preview problem: ${e.message}`, 6000);
  } finally {
    if (seq === S.previewSeq) hideStage();
  }
}

async function ensureOverlays(list) {
  const p = S.project;
  const need = (list || p.overlays).filter((o) => list || !o.ready);
  for (const o of need) {
    const blob = await drawOverlay(o.spec);
    await API.png(`/api/projects/${p.id}/overlays/${o.key}`, blob);
    o.ready = true;
  }
}

async function exportVideo() {
  const p = S.project;
  if (S.exporting || !p) return;
  S.exporting = true;
  S.previewSeq++;
  hideStage();
  const btn = $("#btn-export");
  const box = $("#export-progress");
  btn.disabled = true;
  box.hidden = false;
  $("#export-text").textContent = "Starting…";
  try {
    await ensureOverlays();
    const last = await API.stream(`/api/projects/${p.id}/render`, { quality: "export" }, (ev) => {
      if (ev.type === "progress") {
        $("#export-bar").style.width = `${Math.round(ev.value * 100)}%`;
        $("#export-text").textContent = `Exporting HD… ${Math.round(ev.value * 100)}%`;
      }
    });
    if (last && last.type === "done") {
      applyState(last.project);
      toast(`✅ Saved **${last.file}** to Videos → Beanie AI → Exports`, 6000);
    } else if (last) {
      toast(last.message || "The export didn't finish.", 6000);
    }
  } catch (e) {
    toast(e.message, 6000);
  } finally {
    S.exporting = false;
    btn.disabled = false;
    box.hidden = true;
    schedulePreview();
  }
}

function renderExports() {
  const box = $("#exports");
  box.innerHTML = "";
  (S.project.exports || []).slice().reverse().slice(0, 4).forEach((x) => {
    const card = el(`<div class="export-card"><span>🎉</span><span class="name" title="${esc(x.file)}">${esc(x.file)}</span>
      <span class="muted">${fmt(x.duration)}</span>
      <button class="btn small" type="button">📂 Show in folder</button>
      <a class="btn small ghost" href="/api/exports/${encodeURIComponent(x.file)}" download>⬇️ Download</a></div>`);
    $("button", card).onclick = () => API.post("/api/open", { what: "export", file: x.file }).catch((e) => toast(e.message));
    box.append(card);
  });
}

// ------------------------------------------------------------------ drawing captions and stickers
const TEXT_SIZES = { small: 58, medium: 78, big: 104 };
const STICKER_SIZES = { small: 170, medium: 260, big: 380 };
const TEXT_COLORS = {
  white: "#ffffff", yellow: "#ffe600", red: "#ff3b3b", green: "#7cff4f", blue: "#4fc3ff",
  pink: "#ff5fd2", orange: "#ff9a1f", purple: "#b98cff", black: "#111111",
};
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji"';

function wrapText(g, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((w) => {
    const tryLine = line ? `${line} ${w}` : w;
    if (g.measureText(tryLine).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = tryLine;
  });
  if (line) lines.push(line);
  return lines;
}

/** A caption or emoji as a see-through PNG, sized for a 1080-wide video. */
async function drawOverlay(spec) {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  if (spec.kind === "sticker") {
    const size = STICKER_SIZES[spec.size] || 260;
    const pad = Math.round(size * 0.28);
    c.width = c.height = size + pad * 2;
    g.font = `${size}px ${EMOJI_FONT}, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = "rgba(0,0,0,.55)";
    g.shadowBlur = size * 0.08;
    g.shadowOffsetY = size * 0.03;
    g.fillText(spec.emoji, c.width / 2, c.height / 2 + size * 0.05);
  } else {
    const size = TEXT_SIZES[spec.size] || 78;
    const font = `900 ${size}px "Arial Black","Segoe UI Black","Segoe UI",Impact,${EMOJI_FONT},sans-serif`;
    g.font = font;
    const lines = wrapText(g, spec.text, 940);
    const stroke = Math.max(6, Math.round(size * 0.16));
    const lineH = size * 1.2;
    const widest = Math.max(...lines.map((l) => g.measureText(l).width));
    c.width = Math.ceil(Math.min(1060, widest) + stroke * 2 + 24);
    c.height = Math.ceil(lines.length * lineH + stroke * 2 + 16);
    g.font = font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    lines.forEach((line, i) => {
      const y = stroke + 8 + lineH * (i + 0.5);
      g.shadowColor = "rgba(0,0,0,.45)";
      g.shadowBlur = 14;
      g.lineWidth = stroke;
      g.strokeStyle = spec.color === "black" ? "#ffffff" : "#000000";
      g.strokeText(line, c.width / 2, y, 1040);
      g.shadowBlur = 0;
      g.fillStyle = TEXT_COLORS[spec.color] || "#ffffff";
      g.fillText(line, c.width / 2, y, 1040);
    });
  }
  return new Promise((resolve) => c.toBlob(resolve, "image/png"));
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
}

async function openSetup() {
  openModal('<h2>🧠 Beanie\'s AI brain</h2><p class="muted">Checking…</p>');
  await loadStatus(true);
  renderSetup();
}

function renderSetup(progressHtml = "") {
  const st = S.status;
  if (!st) return;
  const b = st.brain;
  const installed = new Set(b.models || []);
  const rows = st.recommended_models.map((m) => {
    const has = installed.has(m.name);
    const inUse = has && b.model === m.name;
    const action = inUse ? '<span class="pill ok">In use ✓</span>'
      : has ? `<button class="btn small" data-use="${esc(m.name)}">Use this</button>`
        : `<button class="btn small primary" data-pull="${esc(m.name)}" ${b.online ? "" : "disabled"}>Download</button>`;
    return `<div class="model-row"><div class="grow"><b>${esc(m.name)}</b> <span class="muted">${esc(m.size)}</span>
      <small>${esc(m.note)}</small></div>${action}</div>`;
  }).join("");
  const others = (b.models || []).filter((n) => !st.recommended_models.some((m) => m.name === n));
  const otherRows = others.map((n) => `<div class="model-row"><div class="grow"><b>${esc(n)}</b></div>${
    b.model === n ? '<span class="pill ok">In use ✓</span>' : `<button class="btn small" data-use="${esc(n)}">Use this</button>`}</div>`).join("");
  const set = st.settings;
  const m = openModal(`
    <h2>🧠 Beanie's AI brain</h2>
    <p class="muted">The brain runs on your PC with a free app called <b>Ollama</b>. Nothing you say or edit leaves your computer.</p>
    <div class="step-box ${b.online ? "done" : ""}">
      <b>1. Install Ollama</b>
      ${b.online ? `<div>✅ Ollama is running (version ${esc(b.version)}).</div>` : `
        <div class="muted">Download and install it, open it once, then press <b>Check again</b>.</div>
        <div class="row"><a class="btn primary" href="https://ollama.com/download" target="_blank" rel="noopener">⬇️ Get Ollama (free)</a>
        <button class="btn" id="setup-recheck">🔄 Check again</button></div>`}
    </div>
    <div class="step-box ${b.ready ? "done" : ""}">
      <b>2. Download a brain</b>
      <div class="muted">Pick one. Bigger = smarter but slower. <b>gemma3:4b</b> is the best for most PCs and can watch your clips.</div>
      ${rows}${otherRows}
      <details style="margin-top:10px"><summary class="muted">Use another model</summary>
        <div class="row"><input class="text-input" id="custom-model" placeholder="model name, e.g. qwen2.5:7b">
        <button class="btn small" id="custom-pull" ${b.online ? "" : "disabled"}>Download + use</button></div></details>
      <div id="pull-progress">${progressHtml}</div>
    </div>
    <h3>Settings</h3>
    <label class="switch"><input type="checkbox" id="set-instant" ${set.instant_commands ? "checked" : ""}>
      Do clear commands instantly ("cut 0 to 3", "skull at the end") without waiting for the AI</label>
    <label class="switch"><input type="checkbox" id="set-auto" ${set.auto_preview ? "checked" : ""}>
      Make a new preview after every change</label>
    <details style="margin-top:10px"><summary class="muted">Advanced</summary>
      <div class="row"><span>Ollama address</span><input class="text-input" id="set-url" value="${esc(set.ollama_url)}">
      <button class="btn small" id="set-url-save">Save</button></div></details>
  `);
  m.querySelectorAll("[data-pull]").forEach((btn) => { btn.onclick = () => pullModel(btn.dataset.pull); });
  m.querySelectorAll("[data-use]").forEach((btn) => { btn.onclick = () => saveSettings({ model: btn.dataset.use }); });
  const recheck = $("#setup-recheck");
  if (recheck) recheck.onclick = openSetup;
  $("#custom-pull").onclick = () => { const v = $("#custom-model").value.trim(); if (v) pullModel(v); };
  $("#set-instant").onchange = (e) => saveSettings({ instant_commands: e.target.checked }, false);
  $("#set-auto").onchange = (e) => saveSettings({ auto_preview: e.target.checked }, false);
  $("#set-url-save").onclick = () => saveSettings({ ollama_url: $("#set-url").value.trim() });
}

async function saveSettings(changes, rerender = true) {
  try {
    const out = await API.post("/api/settings", changes);
    S.status.settings = out.settings;
    S.status.brain = out.brain;
    renderHeader();
    if (rerender) renderSetup();
    if (S.project && S.mounted) renderProject();
  } catch (e) { toast(e.message); }
}

async function pullModel(name) {
  const box = $("#pull-progress");
  const show = (text, frac) => {
    box.innerHTML = `<div style="margin-top:10px">${esc(text)}</div>` +
      (frac != null ? `<div class="bar" style="margin-top:6px"><div style="width:${Math.round(frac * 100)}%"></div></div>` : "");
  };
  document.querySelectorAll("[data-pull],[data-use],#custom-pull").forEach((b) => { b.disabled = true; });
  show(`Downloading ${name}… (this can take a while: it's a few GB)`, 0);
  try {
    const last = await API.stream("/api/models/pull", { model: name }, (ev) => {
      if (ev.type === "progress") {
        const frac = ev.total ? ev.completed / ev.total : null;
        const gb = ev.total ? ` ${(ev.completed / 1e9).toFixed(2)} / ${(ev.total / 1e9).toFixed(2)} GB` : "";
        show(`${name}: ${ev.status}${gb}`, frac);
      }
    });
    if (last && last.type === "done") {
      await loadStatus(true);
      renderSetup(`<div style="margin-top:10px">✅ ${esc(name)} is ready! Close this and start chatting.</div>`);
      if (S.project && S.mounted) renderProject();
    } else {
      renderSetup(`<div style="margin-top:10px;color:#fecdd3">⚠ ${esc((last && last.message) || "The download stopped.")}</div>`);
    }
  } catch (e) {
    renderSetup(`<div style="margin-top:10px;color:#fecdd3">⚠ ${esc(e.message)}</div>`);
  }
}

function openSounds() {
  const st = S.status || { sounds: {}, music: [] };
  let playing = null;
  const rows = Object.entries(st.sounds).map(([name, about]) => `<div class="sound-row">
      <button class="btn tiny" data-play="${esc(name)}" title="Play">▶</button>
      <div class="grow"><b>${esc(name)}</b><small>${esc(about)}</small></div>
      ${S.project && S.project.status === "ready" ? `<button class="btn tiny ghost" data-add="${esc(name)}" title="Add at the moment you're watching">+ here</button>` : ""}
    </div>`).join("");
  const songs = (st.music || []).length ? st.music.map((s) => `<span class="pill">🎵 ${esc(s)}</span>`).join(" ")
    : '<span class="muted">No songs yet. Put MP3s in your <b>My Music</b> folder.</span>';
  const m = openModal(`<h2>🔊 Sounds</h2>
    <p class="muted">Beanie can drop these on any moment. Just say it: <b>"boom at 6"</b>, <b>"sad trombone at the end"</b>.
    Add your own sounds (like a vine boom) to <b>My Sounds</b> and ask for them by name.</p>
    <div class="sound-list">${rows}</div>
    <h3>Songs</h3><div class="row">${songs}</div>
    <div class="row">
      <button class="btn small" data-open="sounds">📂 Open My Sounds</button>
      <button class="btn small" data-open="music">📂 Open My Music</button>
      <button class="btn small" data-open="exports">📂 Open Exports</button>
    </div>`);
  m.querySelectorAll("[data-play]").forEach((b) => {
    b.onclick = () => {
      if (playing) playing.pause();
      playing = new Audio(`/api/sounds/${encodeURIComponent(b.dataset.play)}`);
      playing.play().catch((e) => toast(e.message));
    };
  });
  m.querySelectorAll("[data-add]").forEach((b) => {
    b.onclick = async () => {
      closeModal();
      const t = playerTime();
      try {
        const out = await API.post(`/api/projects/${S.project.id}/actions`, {
          actions: [{ do: "sound", name: b.dataset.add, at: t == null ? "start" : Number((S.view === "edited" ? toClipTime(t) ?? t : t).toFixed(2)) }],
          say: true,
        });
        applyState(out.project);
        renderChat();
      } catch (e) { toast(e.message); }
    };
  });
  m.querySelectorAll("[data-open]").forEach((b) => {
    b.onclick = () => API.post("/api/open", { what: b.dataset.open }).catch((e) => toast(e.message));
  });
}

async function openClips() {
  openModal("<h2>🎬 My clips</h2><p class='muted'>Loading…</p>");
  try {
    const { projects } = await API.get("/api/projects");
    const rows = projects.map((p) => `<div class="clip-row" data-id="${esc(p.id)}">
        <span>🎞️</span><div class="grow"><b>${esc(p.name)}</b><div class="muted">${fmt(p.duration)} · ${timeAgo(p.created)}${p.exports ? ` · ${p.exports} export(s)` : ""}</div></div>
        <button class="btn tiny ghost danger" data-del="${esc(p.id)}" title="Delete this clip from Beanie">🗑</button></div>`).join("");
    const m = openModal(`<h2>🎬 My clips</h2>
      <div class="row"><button class="btn primary small" id="new-clip">＋ Add a new clip</button></div>
      <div class="clip-list">${rows || '<p class="muted">No clips yet.</p>'}</div>
      <p class="muted" style="margin-top:12px">Deleting a clip here doesn't touch your recordings or exported videos.</p>`);
    $("#new-clip").onclick = () => { closeModal(); showHome(); };
    m.querySelectorAll(".clip-row").forEach((r) => {
      r.onclick = (e) => {
        if (e.target.closest("[data-del]")) return;
        closeModal();
        openProject(r.dataset.id);
      };
    });
    m.querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("Delete this clip from Beanie? (Your original recording stays.)")) return;
        await API.post(`/api/projects/${b.dataset.del}/delete`);
        if (S.project && S.project.id === b.dataset.del) showHome();
        openClips();
      };
    });
  } catch (e) { toast(e.message); }
}

// ------------------------------------------------------------------ start
function boot() {
  $("#composer").onsubmit = (e) => { e.preventDefault(); send(); };
  const input = $("#input");
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $("#btn-setup").onclick = openSetup;
  $("#brain-pill").onclick = openSetup;
  $("#btn-sounds").onclick = openSounds;
  $("#btn-clips").onclick = openClips;
  $("#modal-back").onclick = (e) => { if (e.target.id === "modal-back") closeModal(); };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#modal-back").hidden) closeModal();
    const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (typing || !S.mounted || !$("#modal-back").hidden) return;
    if (e.key === "m" || e.key === "M") { e.preventDefault(); markHere(); }
    if (e.key === " ") {
      e.preventDefault();
      const v = S.view === "edited" ? $("#vid-edited") : $("#vid-original");
      if (v.paused) v.play().catch(() => {}); else v.pause();
    }
  });
  // drop a video anywhere
  document.addEventListener("dragover", (e) => { e.preventDefault(); const d = $("#drop"); if (d) d.classList.add("over"); });
  document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) { const d = $("#drop"); if (d) d.classList.remove("over"); } });
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    const d = $("#drop");
    if (d) d.classList.remove("over");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) uploadFile(file);
  });
  requestAnimationFrame(tickPlayhead);
  loadStatus().then(() => {
    const last = remember("beanie.project");
    if (last) openProject(last); else showHome();
  });
  setInterval(() => loadStatus(), 15000);
  window.addEventListener("focus", () => loadStatus());
}

boot();
