// Sea Server Finder — content script (runs on www.roblox.com)
//
// Adds a "Server Finder" panel to Roblox game pages. It lists public servers
// for any place of the game (for Blox Fruits: First, Second and Third Sea),
// sorted by ping, and can look up where each server is to estimate the ping
// from *your* location. Each server has a Join button.
//
// Where the numbers come from:
// - "Ping" is what Roblox reports for the server: the average ping of the
//   players already in it. It is a good guide, but not your personal ping.
// - "Your est." is worked out from the distance between you and the server.
//   To find where a server is, the panel asks Roblox for that server's address
//   (the same request the Roblox website makes when you press Play), then
//   looks the address up. Only the address is kept: the join ticket in
//   Roblox's answer is never stored or sent anywhere.

(() => {
  if (window.__seaServerFinder) return;
  window.__seaServerFinder = true;

  // ---------------------------------------------------------------- settings

  const BLOX_FRUITS = [
    { label: "First Sea", placeId: 2753915549 },
    { label: "Second Sea", placeId: 4442272183 },
    { label: "Third Sea", placeId: 7449423635 },
  ];
  const PAGE_SIZE = 100; // the most Roblox returns per page
  const LOCATE_COUNT = 15; // servers located per "Check locations" press
  const LOCATE_GAP_MS = 400; // pause between address requests, to be polite
  const SHOW_ROWS = 60; // rows drawn at once; the rest are summarised

  // ----------------------------------------------------------------- helpers

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k in el && k !== "list") el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function currentPlaceId() {
    const m = location.pathname.match(/\/games\/(\d+)/);
    return m ? Number(m[1]) : null;
  }

  function placesFor(placeId) {
    if (BLOX_FRUITS.some((p) => p.placeId === placeId)) return BLOX_FRUITS;
    return placeId ? [{ label: "This game", placeId }] : [];
  }

  // distance between two points on Earth, in km
  function distanceKm(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(s));
  }

  // Light in fibre covers ~200 km per ms; real routes are ~1.5x longer than a
  // straight line and there and back doubles it, plus ~10 ms for home wifi/ISP.
  function estimatePing(self, server) {
    if (!self || !server || self.lat == null || server.lat == null) return null;
    return Math.round(10 + distanceKm(self, server) / 67);
  }

  // ------------------------------------------------------------- Roblox API

  async function fetchJson(url, init, tries = 4) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { credentials: "include", ...init });
      if (res.status === 429 && attempt < tries) {
        await sleep(1500 * 2 ** attempt); // Roblox asked us to slow down
        continue;
      }
      if (!res.ok) {
        const err = new Error("Roblox answered " + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json();
    }
  }

  async function fetchServers(placeId, maxServers, onProgress) {
    const all = [];
    let cursor = "";
    while (all.length < maxServers) {
      const url =
        `https://games.roblox.com/v1/games/${placeId}/servers/Public` +
        `?sortOrder=Desc&excludeFullGames=true&limit=${PAGE_SIZE}` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const page = await fetchJson(url);
      for (const s of page.data || []) {
        all.push({
          id: s.id,
          playing: s.playing ?? 0,
          maxPlayers: s.maxPlayers ?? 0,
          ping: typeof s.ping === "number" ? s.ping : null,
          fps: typeof s.fps === "number" ? s.fps : null,
          location: null, // filled in by "Check locations"
          est: null,
          note: "",
        });
      }
      onProgress(all.length);
      cursor = page.nextPageCursor;
      if (!cursor) break;
    }
    return all;
  }

  // Roblox pages carry a fresh anti-forgery token; start with it
  let csrfToken =
    (document.querySelector('meta[name="csrf-token"]') || { dataset: {} }).dataset.token || "";

  // Ask Roblox for the server's network address (what the Play button does).
  // Returns { ip } or { error } — never the join ticket.
  async function serverAddress(placeId, gameId) {
    const body = JSON.stringify({
      placeId,
      gameId,
      isTeleport: false,
      gameJoinAttemptId: crypto.randomUUID(),
    });
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch("https://gamejoin.roblox.com/v1/join-game-instance", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body,
      });
      const fresh = res.headers.get("x-csrf-token");
      if (res.status === 403 && fresh && fresh !== csrfToken) {
        csrfToken = fresh; // Roblox's anti-forgery handshake: retry with it
        continue;
      }
      if (res.status === 429) {
        return { error: "Roblox is rate-limiting; wait a minute", rateLimited: true };
      }
      if (res.status === 401) return { error: "Log in to Roblox first", fatal: true };
      if (!res.ok) return { error: "Roblox answered " + res.status };

      const data = await res.json();
      const script = data.joinScript;
      if (script) {
        const ip =
          (script.UdmuxEndpoints && script.UdmuxEndpoints[0] && script.UdmuxEndpoints[0].Address) ||
          script.MachineAddress;
        return ip ? { ip } : { error: "No address in Roblox's answer" };
      }
      // status 0/1: Roblox is still getting the server ready; ask again
      if (data.status === 0 || data.status === 1) {
        await sleep(1000);
        continue;
      }
      return {
        error: data.message || "Can't join this place directly",
        blocked: data.status === 12,
      };
    }
    return { error: "Roblox did not answer in time" };
  }

  function geo(ip) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "geo", ip }, (reply) => {
          if (chrome.runtime.lastError || !reply) {
            resolve({ ok: false, error: "Extension was updated: reload this page" });
          } else resolve(reply);
        });
      } catch (_) {
        resolve({ ok: false, error: "Extension was updated: reload this page" });
      }
    });
  }

  // -------------------------------------------------------------------- state

  const state = {
    places: [],
    pagePlaceId: undefined, // the game page the places were set up for
    placeId: null,
    servers: [],
    self: null, // the player's own location
    loading: false,
    locating: false,
    sort: "ping",
    minFree: 1,
    minPlayers: 5, // skip near-empty servers: there's nobody to PvP there
    scanSize: 300,
    status: "",
    statusKind: "",
  };

  // ------------------------------------------------------------------ styles

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Builder Sans", "Gotham SSm", system-ui, -apple-system, "Segoe UI", sans-serif; }
    .launcher {
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px; border-radius: 12px; border: 1px solid #3a3d45;
      background: #232527; color: #f2f4f5; font-size: 14px; font-weight: 600;
      box-shadow: 0 6px 20px rgba(0,0,0,.35); cursor: pointer;
      transition: transform .12s ease, background .12s ease;
    }
    .launcher:hover { background: #2c2f33; transform: translateY(-1px); }
    .launcher svg { width: 18px; height: 18px; }
    .panel {
      position: fixed; right: 20px; bottom: 72px; z-index: 2147483001;
      width: min(480px, calc(100vw - 32px)); max-height: min(78vh, 720px);
      display: flex; flex-direction: column;
      background: #1b1d1f; color: #e8eaec; border: 1px solid #34373c;
      border-radius: 14px; box-shadow: 0 16px 48px rgba(0,0,0,.5);
      font-size: 13px; overflow: hidden;
    }
    .panel > :not(.list) { flex-shrink: 0; }
    .head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 10px; }
    .title { font-size: 16px; font-weight: 700; }
    .sub { color: #9aa0a6; font-size: 12px; margin-top: 2px; }
    .x { background: none; border: 0; color: #9aa0a6; font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 8px; }
    .x:hover { background: #2a2d31; color: #fff; }
    .tabs { display: flex; gap: 6px; padding: 0 16px 10px; flex-wrap: wrap; }
    .tab {
      padding: 7px 12px; border-radius: 999px; border: 1px solid #3a3d45;
      background: #232527; color: #cfd3d7; cursor: pointer; font-size: 13px; font-weight: 600;
    }
    .tab:hover { background: #2c2f33; }
    .tab.on { background: #335fff; border-color: #335fff; color: #fff; }
    .custom { display: flex; gap: 6px; padding: 0 16px 10px; }
    .controls { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 0 16px 10px; }
    label.f { display: flex; flex-direction: column; gap: 4px; color: #9aa0a6; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; }
    select, input {
      background: #232527; color: #e8eaec; border: 1px solid #3a3d45; border-radius: 8px;
      padding: 7px 8px; font-size: 13px; width: 100%;
    }
    .actions { display: flex; gap: 8px; padding: 0 16px 10px; }
    .btn {
      flex: 1; padding: 9px 12px; border-radius: 10px; border: 1px solid #3a3d45;
      background: #232527; color: #e8eaec; font-weight: 700; font-size: 13px; cursor: pointer;
      transition: background .12s ease, transform .08s ease;
    }
    .btn:hover:not(:disabled) { background: #2c2f33; }
    .btn:active:not(:disabled) { transform: scale(.98); }
    .btn:disabled { opacity: .45; cursor: default; }
    .btn.primary { background: #335fff; border-color: #335fff; color: #fff; }
    .btn.primary:hover:not(:disabled) { background: #4a71ff; }
    .status { padding: 0 16px 8px; color: #9aa0a6; font-size: 12px; min-height: 18px; }
    .status.err { color: #ff8a80; }
    .status.ok { color: #7ee2a8; }
    .you { padding: 0 16px 8px; color: #9aa0a6; font-size: 12px; }
    .list { overflow-y: auto; border-top: 1px solid #2a2d31; }
    table { width: 100%; border-collapse: collapse; }
    th {
      position: sticky; top: 0; background: #1b1d1f; text-align: left; color: #9aa0a6;
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
      padding: 8px 6px; border-bottom: 1px solid #2a2d31;
    }
    th:first-child, td:first-child { padding-left: 16px; }
    th:last-child, td:last-child { padding-right: 16px; text-align: right; }
    td { padding: 7px 6px; border-bottom: 1px solid #232527; vertical-align: middle; }
    tr:hover td { background: #212326; }
    .ping { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    td:last-child { white-space: nowrap; }
    .good { color: #7ee2a8; } .ok { color: #f5d06f; } .bad { color: #ff8a80; }
    .muted { color: #6f757b; }
    .loc { color: #cfd3d7; font-size: 12px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .join {
      padding: 6px 12px; border-radius: 8px; border: 0; background: #00b06f; color: #fff;
      font-weight: 700; font-size: 12px; cursor: pointer;
    }
    .join:hover { background: #00c77e; }
    .copy { background: #232527; border: 1px solid #3a3d45; color: #cfd3d7; cursor: pointer; font-size: 12px; font-weight: 600; padding: 5px 8px; border-radius: 8px; margin-right: 4px; }
    .copy:hover { color: #fff; background: #2a2d31; }
    .more, .empty { padding: 12px 16px; color: #9aa0a6; font-size: 12px; }
    .hidden { display: none !important; }
    @media (max-width: 480px) {
      .controls { grid-template-columns: 1fr 1fr; }
      th, td { padding-left: 4px; padding-right: 4px; }
      th:first-child, td:first-child { padding-left: 12px; }
      th:last-child, td:last-child { padding-right: 12px; }
      .loc { display: none; }
      th.loc-h { display: none; }
      .ping, td { font-size: 12px; }
      .join { padding: 6px 9px; }
    }
  `;

  const WAVE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    '<path d="M2 16c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/>' +
    '<path d="M2 11c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" opacity=".55"/></svg>';

  // --------------------------------------------------------------------- DOM

  const host = h("div", { id: "sea-server-finder" });
  const root = host.attachShadow({ mode: "open" });
  root.append(h("style", {}, CSS));

  const launcher = h("button", { class: "launcher", title: "Find a low-ping server" });
  launcher.innerHTML = WAVE_ICON; // static markup, no page data
  launcher.append("Server Finder");

  const tabs = h("div", { class: "tabs" });
  const customInput = h("input", { placeholder: "Other place ID (optional)", inputMode: "numeric" });
  const customBtn = h("button", { class: "btn", style: "flex:0 0 auto" }, "Use");
  const sortSel = h(
    "select",
    {},
    h("option", { value: "ping" }, "Best ping"),
    h("option", { value: "est" }, "Your est. ping"),
    h("option", { value: "players" }, "Most players"),
    h("option", { value: "space" }, "Most space")
  );
  const minFreeInput = h("input", { type: "number", min: "0", max: "50", value: "1" });
  const minPlayersInput = h("input", { type: "number", min: "0", max: "50", value: "5" });
  const scanSel = h(
    "select",
    {},
    h("option", { value: "100" }, "100 servers"),
    h("option", { value: "300", selected: true }, "300 servers"),
    h("option", { value: "500" }, "500 servers"),
    h("option", { value: "1000" }, "1000 servers")
  );
  const scanBtn = h("button", { class: "btn primary" }, "Find servers");
  const locateBtn = h("button", { class: "btn", title: "Look up where the top servers are, to estimate your ping" }, "Check locations");
  const statusEl = h("div", { class: "status" });
  const youEl = h("div", { class: "you hidden" });
  const listEl = h("div", { class: "list" });
  const subEl = h("div", { class: "sub" });

  const panel = h(
    "div",
    { class: "panel hidden" },
    h(
      "div",
      { class: "head" },
      h("div", {}, h("div", { class: "title" }, "Server Finder"), subEl),
      h("button", { class: "x", title: "Close", onclick: () => toggle(false) }, "×")
    ),
    tabs,
    h("div", { class: "custom" }, customInput, customBtn),
    h(
      "div",
      { class: "controls" },
      h("label", { class: "f" }, "Sort by", sortSel),
      h("label", { class: "f", title: "Hide servers with fewer players than this" }, "Players ≥", minPlayersInput),
      h("label", { class: "f", title: "Hide servers with fewer open spots than this" }, "Free slots ≥", minFreeInput),
      h("label", { class: "f" }, "Scan", scanSel)
    ),
    h("div", { class: "actions" }, scanBtn, locateBtn),
    statusEl,
    youEl,
    listEl
  );

  root.append(launcher, panel);

  // ------------------------------------------------------------------ render

  function setStatus(text, kind = "") {
    state.status = text;
    state.statusKind = kind;
    statusEl.textContent = text;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function pingClass(ms) {
    if (ms == null) return "muted";
    if (ms <= 80) return "good";
    if (ms <= 160) return "ok";
    return "bad";
  }

  function renderTabs() {
    tabs.replaceChildren(
      ...state.places.map((p) =>
        h(
          "button",
          {
            class: "tab" + (p.placeId === state.placeId ? " on" : ""),
            onclick: () => selectPlace(p.placeId),
          },
          p.label
        )
      )
    );
    const place = state.places.find((p) => p.placeId === state.placeId);
    subEl.textContent = place ? `${place.label} · place ${place.placeId}` : "Pick a place to scan";
  }

  function sorted() {
    const minFree = Math.max(0, Number(state.minFree) || 0);
    const minPlayers = Math.max(0, Number(state.minPlayers) || 0);
    const rows = state.servers.filter(
      (s) => s.maxPlayers - s.playing >= minFree && s.playing >= minPlayers
    );
    const nullsLast = (a, b) => (a == null) - (b == null) || (a ?? 0) - (b ?? 0);
    const by = {
      ping: (a, b) => nullsLast(a.ping, b.ping),
      est: (a, b) => nullsLast(a.est, b.est) || nullsLast(a.ping, b.ping),
      players: (a, b) => b.playing - a.playing || nullsLast(a.ping, b.ping),
      space: (a, b) => b.maxPlayers - b.playing - (a.maxPlayers - a.playing) || nullsLast(a.ping, b.ping),
    }[state.sort];
    return rows.sort(by);
  }

  function renderList() {
    const rows = sorted();
    if (!state.servers.length) {
      listEl.replaceChildren(
        h("div", { class: "empty" }, state.loading ? "Loading…" : "Press “Find servers” to scan this place.")
      );
      return;
    }
    if (!rows.length) {
      listEl.replaceChildren(h("div", { class: "empty" }, "No servers match. Lower “Players” or “Free slots”."));
      return;
    }
    const shown = rows.slice(0, SHOW_ROWS);
    const body = shown.map((s) =>
      h(
        "tr",
        {},
        h("td", { class: "ping " + pingClass(s.ping) }, s.ping == null ? "—" : s.ping + " ms"),
        h("td", { class: "ping " + pingClass(s.est) }, s.est == null ? h("span", { class: "muted" }, "—") : "≈" + s.est + " ms"),
        h("td", {}, `${s.playing}/${s.maxPlayers}`),
        h("td", { class: "loc", title: s.note || s.location || "" }, s.location || h("span", { class: "muted" }, s.note || "—")),
        h(
          "td",
          {},
          h(
            "button",
            { class: "copy", title: "Copy this server's Job ID, to paste into the game's own server join", onclick: () => copyJobId(s) },
            "Copy ID"
          ),
          h("button", { class: "join", onclick: () => join(s) }, "Join")
        )
      )
    );
    const table = h(
      "table",
      {},
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", { title: "Average ping of the players already in the server (from Roblox)" }, "Ping"),
          h("th", { title: "Estimated ping from your location, after “Check locations”" }, "Your est."),
          h("th", {}, "Players"),
          h("th", { class: "loc-h" }, "Location"),
          h("th", {}, "")
        )
      ),
      h("tbody", {}, body)
    );
    const extra =
      rows.length > SHOW_ROWS
        ? h("div", { class: "more" }, `Showing the best ${SHOW_ROWS} of ${rows.length} servers.`)
        : null;
    listEl.replaceChildren(table, extra || "");
  }

  function renderButtons() {
    scanBtn.disabled = state.loading || !state.placeId;
    scanBtn.textContent = state.loading ? "Scanning…" : "Find servers";
    locateBtn.disabled = state.loading || state.locating || !state.servers.length;
    locateBtn.textContent = state.locating ? "Checking…" : "Check locations";
  }

  function render() {
    renderTabs();
    renderButtons();
    renderList();
  }

  // ----------------------------------------------------------------- actions

  function selectPlace(placeId) {
    if (state.loading || state.locating) return;
    state.placeId = placeId;
    state.servers = [];
    setStatus("");
    render();
    scan();
  }

  async function scan() {
    if (!state.placeId || state.loading) return;
    state.loading = true;
    state.servers = [];
    setStatus("Scanning servers…");
    render();
    try {
      state.servers = await fetchServers(state.placeId, state.scanSize, (n) =>
        setStatus(`Scanning servers… ${n} found`)
      );
      const withPing = state.servers.filter((s) => s.ping != null).length;
      setStatus(
        state.servers.length
          ? `Found ${state.servers.length} servers (${withPing} with a ping). Press “Check locations” to estimate your own ping.`
          : "No open servers right now for this place.",
        state.servers.length ? "ok" : ""
      );
    } catch (err) {
      setStatus(
        err.status === 400 || err.status === 404
          ? "Roblox doesn't list servers for this place ID."
          : "Couldn't load servers: " + err.message,
        "err"
      );
    } finally {
      state.loading = false;
      render();
    }
  }

  async function locate() {
    if (state.locating || !state.servers.length) return;
    state.locating = true;
    render();

    if (!state.self) {
      setStatus("Finding your location…");
      const me = await geo("");
      if (me.ok) {
        state.self = me.geo;
        youEl.textContent = `You: ${[me.geo.city, me.geo.country].filter(Boolean).join(", ")}`;
        youEl.classList.remove("hidden");
      } else {
        setStatus("Couldn't find your location: " + me.error, "err");
        state.locating = false;
        render();
        return;
      }
    }

    // the best servers in the current order that haven't been located yet
    const todo = sorted().filter((s) => !s.location && !s.note).slice(0, LOCATE_COUNT);
    let done = 0;
    let blocked = 0;
    for (const s of todo) {
      setStatus(`Checking server locations… ${done}/${todo.length}`);
      let addr;
      try {
        addr = await serverAddress(state.placeId, s.id);
      } catch (err) {
        addr = { error: "Network error: " + (err.message || err), fatal: true };
      }
      if (addr.ip) {
        const where = await geo(addr.ip);
        if (where.ok) {
          s.location = [where.geo.city, where.geo.countryCode || where.geo.country].filter(Boolean).join(", ") || "Unknown";
          s.est = estimatePing(state.self, where.geo);
        } else {
          s.note = where.error;
        }
      } else {
        s.note = addr.error;
        if (addr.blocked) blocked++;
        if (addr.fatal || addr.rateLimited) {
          setStatus(addr.error, "err");
          break;
        }
      }
      done++;
      renderList();
      await sleep(LOCATE_GAP_MS);
    }

    state.locating = false;
    if (blocked && blocked === done) {
      setStatus(
        "This place doesn't let players join its servers straight from the website, so locations (and the Join button) may not work here.",
        "err"
      );
    } else if (state.statusKind !== "err") {
      setStatus(`Located ${done} servers. Sort by “Your est. ping” to see the closest.`, "ok");
    }
    render();
  }

  function joinUrl(s) {
    return `roblox://experiences/start?placeId=${state.placeId}&gameInstanceId=${s.id}`;
  }

  function join(s) {
    // opens the Roblox app straight into this server
    const a = h("a", { href: joinUrl(s), style: "display:none" });
    document.body.append(a);
    a.click();
    a.remove();
    setStatus("Opening Roblox… (allow the browser to open it if it asks)", "ok");
  }

  // Games like Blox Fruits let you join a server from inside the game by
  // pasting its Job ID, which also works where direct joining is blocked.
  async function copyJobId(s) {
    try {
      await navigator.clipboard.writeText(s.id);
      setStatus("Job ID copied. In the game, open its server join and paste it (Ctrl+V).", "ok");
    } catch (_) {
      setStatus("Job ID: " + s.id);
    }
  }

  function toggle(open) {
    const show = open ?? panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !show);
    if (show) {
      const pid = currentPlaceId();
      const places = placesFor(pid);
      if (pid !== state.pagePlaceId && places.length) {
        // first open, or the player moved to another game's page
        state.pagePlaceId = pid;
        state.places = places;
        state.placeId = pid;
        state.servers = [];
        render();
        scan();
      } else {
        render();
      }
      if (!state.places.length) setStatus("Open a game page, or type a place ID above.");
    }
  }

  // ------------------------------------------------------------------ wiring

  launcher.addEventListener("click", () => toggle());
  scanBtn.addEventListener("click", scan);
  locateBtn.addEventListener("click", locate);
  sortSel.addEventListener("change", () => {
    state.sort = sortSel.value;
    renderList();
  });
  minPlayersInput.addEventListener("input", () => {
    state.minPlayers = minPlayersInput.value;
    renderList();
  });
  minFreeInput.addEventListener("input", () => {
    state.minFree = minFreeInput.value;
    renderList();
  });
  scanSel.addEventListener("change", () => {
    state.scanSize = Number(scanSel.value);
  });
  customBtn.addEventListener("click", () => {
    const id = Number(customInput.value.trim());
    if (!Number.isInteger(id) || id <= 0) {
      setStatus("Type a place ID (the number in a game's link).", "err");
      return;
    }
    if (!state.places.some((p) => p.placeId === id)) {
      state.places = [...state.places.filter((p) => p.label !== "Custom"), { label: "Custom", placeId: id }];
    }
    selectPlace(id);
  });

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "toggle") toggle();
    });
  } catch (_) {
    // extension context gone (it was reloaded): the page just needs a refresh
  }

  // only show the launcher on game pages; the toolbar icon works everywhere
  function syncLauncher() {
    launcher.classList.toggle("hidden", currentPlaceId() == null);
  }

  document.documentElement.append(host);
  syncLauncher();
  // Roblox sometimes changes pages without a full reload
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      syncLauncher();
    }
  }, 1000);

  if (new URLSearchParams(location.search).get("ssf") === "open") toggle(true);
  render();
})();
