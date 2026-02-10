// =====================
// CONFIG
// =====================
const PLACE_ID = 109983668079237;
const LIMIT = 100;
const RATE_LIMIT_MS = 5000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const UNIVERSE_ID = 4638540316; // Universe ID for badge fetching
const AUTO_REFRESH_INTERVAL = 180000; // 3 minutes

let lastJoinedServer = null;
let currentUserId = null;
let friendsList = [];
let favorites = new Set();
let csrfToken = null;

// =====================
// STORAGE SAFE WRAPPER
// =====================
const storage = {
  async get(key) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return new Promise(resolve => chrome.storage.local.get(key, d => resolve(d[key] ?? null)));
    }
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  },
  async set(key, value) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
    }
    localStorage.setItem(key, JSON.stringify(value));
  }
};

const settingsStore = {
  async load() {
    return new Promise(resolve => {
      if (chrome?.storage?.local) {
        chrome.storage.local.get("settings", d => resolve(d.settings || {}));
      } else {
        resolve(JSON.parse(localStorage.getItem("settings") || "{}"));
      }
    });
  },
  save(data) {
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ settings: data });
    } else {
      localStorage.setItem("settings", JSON.stringify(data));
    }
  }
};

async function saveLastJoined(server) {
  lastJoinedServer = server;
  await storage.set("lastJoinedServer", server);
}

async function loadLastJoined() {
  lastJoinedServer = await storage.get("lastJoinedServer");
}

async function loadFavorites() {
  const saved = await storage.get("favorites");
  if (Array.isArray(saved)) {
    favorites = new Set(saved);
  }
}

async function saveFavorites() {
  await storage.set("favorites", Array.from(favorites));
}

// =====================
// SOUNDS
// =====================
const clickSound = new Howl({ src: ["sounds/click.mp3"], volume: 0.3 });
const doneSound  = new Howl({ src: ["sounds/done.mp3"],  volume: 0.22 });

function playClick() {
  clickSound.rate(0.95 + Math.random() * 0.1);
  clickSound.play();
}

function playDone() {
  try { doneSound.play(); } catch {}
}

// =====================
// TOASTIFY
// =====================
function notify(text, type = "info") {
  const colors = {
    info: "#1f2430",
    success: "#1e3a2b",
    warn: "#3a2f1e",
    error: "#3a1e1e"
  };

  if (typeof Toastify === "undefined") return;

  Toastify({
    text,
    duration: 2500,
    gravity: "bottom",
    position: "right",
    style: {
      background: colors[type] || colors.info,
      border: "1px solid #2a3244",
      borderRadius: "8px",
      fontSize: "12px",
      color: "#e6e6e6"
    }
  }).showToast();
}

// =====================
// STATE & ELEMENTS
// =====================
let currentCursor = "";
let nextCursor = null;
let endReached = false;
let loading = false;
let totalServers = 0;
let serversWithPlayers = 0;
let serversWithPlayersNoOwner = 0;
let maxPages = 1;
let currentPage = 1;
let pendingAction = { reset: true, useCurrent: false, next: false };
let abortTotals = false;
// We use this to determine who "Provides Access"
let accessibleOwnerIds = new Set();

// UI Elements
const serversDiv = document.getElementById("servers");
const statusEl = document.getElementById("status");
const pageInfoEl = document.getElementById("pageInfo");
const totalServersEl = document.getElementById("totalServers");
const serversWithPlayersEl = document.getElementById("serversWithPlayers");
const serversWithPlayersNoOwnerEl = document.getElementById("serversWithPlayersNoOwner"); 
const showOwnerInsideCb = document.getElementById("showOwnerInside");
const onlyOnePlayerCb = document.getElementById("onlyOnePlayer");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");
const liveCount = document.getElementById("liveCount");
const skipTotalsCb = document.getElementById("skipTotals");
const skipScanBtn = document.getElementById("skipScan");
const scanTotalsAgainBtn = document.getElementById("scanTotalsAgain");
const useDeeplinkCb = document.getElementById("useDeeplink");

// Friend UI Elements
const tabServers = document.getElementById("tabServers");
const tabFriends = document.getElementById("tabFriends");
const viewServers = document.getElementById("viewServers");
const viewFriends = document.getElementById("viewFriends");
const friendsListEl = document.getElementById("friendsList");
const friendStatusEl = document.getElementById("friendStatus");
const friendCountEl = document.getElementById("friendCount");
const selectedCountEl = document.getElementById("selectedCount");
const friendSearchInp = document.getElementById("friendSearch");
const selectAllFriendsBtn = document.getElementById("selectAllFriends");
const removeSelectedBtn = document.getElementById("removeSelected");

// =====================
// TABS & NAVIGATION
// =====================
tabServers.onclick = () => switchTab("servers");
tabFriends.onclick = () => switchTab("friends");

function switchTab(tabName) {
  playClick();
  if (tabName === "servers") {
    tabServers.classList.add("active");
    tabFriends.classList.remove("active");
    viewServers.classList.add("active");
    viewFriends.classList.remove("active");
  } else {
    tabFriends.classList.add("active");
    tabServers.classList.remove("active");
    viewFriends.classList.add("active");
    viewServers.classList.remove("active");
    loadFriends();
  }
}

// =====================
// SERVER UI HELPERS
// =====================
function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

useDeeplinkCb.addEventListener("change", saveConfig);
showOwnerInsideCb.addEventListener("change", () => {
  saveConfig();
  loadServers({ useCurrent: true });
});
onlyOnePlayerCb.addEventListener("change", () => {
  saveConfig();
  loadServers({ useCurrent: true });
});
skipTotalsCb.addEventListener("change", saveConfig);

function saveConfig() {
  settingsStore.save({
    skipTotals: skipTotalsCb.checked,
    showOwnerInside: showOwnerInsideCb.checked,
    onlyOnePlayer: onlyOnePlayerCb?.checked,
    useDeeplink: useDeeplinkCb.checked
  });
}

function setButtonsDisabled(v) {
  document.querySelectorAll("button").forEach(b => {
    if (b.id === "skipScan") return;
    b.disabled = v;
  });
}

function showLoading(show) {
  loadingOverlay.classList.toggle("hidden", !show);
}

function setStatus(t) {
  statusEl.textContent = t;
}

function updateTopStats() {
  totalServersEl.textContent = totalServers ? String(totalServers) : "—";
  serversWithPlayersEl.textContent = serversWithPlayers ? String(serversWithPlayers) : "—";
  serversWithPlayersNoOwnerEl.textContent = serversWithPlayersNoOwner ? String(serversWithPlayersNoOwner) : "—";
}

function updatePageInfo() {
  const mp = maxPages ? maxPages : "—";
  pageInfoEl.textContent = `Page ${currentPage} / ${mp}`;
}

function showSkeletons() {
  serversDiv.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const sk = document.createElement("div");
    sk.className = "skeleton";
    serversDiv.appendChild(sk);
  }
}

// =====================
// FRIENDS LOGIC
// =====================

async function getAuthenticatedUser() {
  try {
    const res = await fetch("https://users.roblox.com/v1/users/authenticated", { credentials: "include" });
    const data = await res.json();
    currentUserId = data.id;
    return data.id;
  } catch {
    return null;
  }
}

async function getCsrfToken() {
  try {
    const res = await fetch("https://auth.roblox.com/v2/logout", { method: "POST", credentials: "include" });
    const token = res.headers.get("x-csrf-token");
    if (token) {
      csrfToken = token;
      return token;
    }
  } catch (e) { console.error(e); }
  return null;
}

async function resolveUsernames(friends) {
  if (!friends.length) return;
  const res = await fetch("https://users.roblox.com/v1/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds: friends.map(f => f.id) })
  });
  const json = await res.json();
  const map = new Map(json.data.map(u => [u.id, u.name]));
  friends.forEach(f => f.username = map.get(f.id) || "");
}

// =====================
// FRIENDS LOGIC
// =====================
async function getAuthenticatedUser() {
  try {
    const res = await fetch(
      "https://users.roblox.com/v1/users/authenticated",
      { credentials: "include" }
    );
    const data = await res.json();
    currentUserId = data.id;
    return data.id;
  } catch {
    return null;
  }
}

async function loadFriends() {
  if (!currentUserId) await getAuthenticatedUser();
  if (!currentUserId) {
    friendStatusEl.textContent = "Please log in to Roblox.";
    return;
  }

  friendsListEl.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  friendStatusEl.textContent = "Fetching friends...";

  try {
    const res = await fetch(
      `https://friends.roblox.com/v1/users/${currentUserId}/friends`,
      { credentials: "include" }
    );
    const data = await res.json();
    friendsList = data.data || [];

    await resolveUsernames(friendsList);

    friendCountEl.textContent = friendsList.length;
    renderFriends(friendsList);
    friendStatusEl.textContent = `Found ${friendsList.length} friends.`;
  } catch {
    friendStatusEl.textContent = "Failed to load friends.";
  }
}

// =====================
// FRIEND SEARCH (single listener)
// =====================
friendSearchInp.addEventListener("input", e => {
  const term = e.target.value.toLowerCase().trim();
  const filtered = friendsList.filter(f =>
    (f.displayName || "").toLowerCase().includes(term) ||
    (f.username || "").toLowerCase().includes(term)
  );
  renderFriends(filtered);
});


async function getHeadshot(f) {
  const apiUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${f.id}&size=150x150&format=Png&isCircular=false`;

  const res = await fetch(apiUrl);
  const data = await res.json();

  return data.data[0].imageUrl;
}

const bgMusic = document.getElementById("bgMusic");
const toggleMusicBtn = document.getElementById("toggleMusic");
let isMusicPlaying = false;

bgMusic.volume = 0.15; // Set to low "background" volume

toggleMusicBtn.onclick = () => {
  if (isMusicPlaying) {
    bgMusic.pause();
    toggleMusicBtn.textContent = "🎵 Music: OFF";
    toggleMusicBtn.classList.remove("active");
  } else {
    bgMusic.play().catch(e => console.log("User interaction required for audio"));
    toggleMusicBtn.textContent = "🎵 Music: ON";
    toggleMusicBtn.classList.add("active");
  }
  isMusicPlaying = !isMusicPlaying;
};

toggleMusicBtn.click()


// =====================
// FRIEND RENDER
// =====================
async function renderFriends(list) {
  friendsListEl.innerHTML = "";
  
  // Get all unique owner IDs from the servers we found during the scan

  try {
    const res = await fetch(`https://games.roblox.com/v1/games/${PLACE_ID}/private-servers?limit=100`, { credentials: "include" });
    const json = await res.json();
    (json.data || []).forEach(s => {
      if (s.owner && s.owner.id) accessibleOwnerIds.add(Number(s.owner.id));
    });
  } catch (e) { console.error("Could not fetch access list", e); }

  if (!list.length) {
    friendsListEl.innerHTML = '<div style="text-align:center;padding:10px;color:#666;">No friends found.</div>';
    return;
  }

  const sortedList = [...list].sort((a, b) => {
    const aAccess = accessibleOwnerIds.has(a.id);
    const bAccess = accessibleOwnerIds.has(b.id);
    const aFav = favorites.has(a.id);
    const bFav = favorites.has(b.id);

    if (aAccess !== bAccess) return aAccess ? -1 : 1; // Access first
    if (aFav !== bFav) return aFav ? -1 : 1;         // Favorites second
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1; // Online third
    return (a.displayName || "").localeCompare(b.displayName || "");
  });

  for (const f of sortedList) {
  const isFav = favorites.has(f.id);
  const hasAccess = accessibleOwnerIds.has(f.id);
  const displayName = f.displayName || f.username || "Unknown User";

  const card = document.createElement("div");
  card.className = "friend-card";
  card.dataset.id = f.id;

  const accessTag = hasAccess 
    ? `<span class="access-badge">Has Access</span>` 
    : `<span class="access-badge no-access">No Access</span>`;

  const headshotUrl = await getHeadshot(f); // ✅ now valid

  card.innerHTML = `
    <div class="actions">
      <input type="checkbox" class="friend-check" ${isFav ? "disabled" : ""}>
    </div>
    <img src="${headshotUrl}" class="friend-avatar" alt="profile">
    <div class="friend-info">
      <div class="friend-name">${displayName}</div>
      <div class="friend-meta">${accessTag}</div>
    </div>
    <div class="actions">
      <button class="star-btn ${isFav ? "active" : ""}">★</button>
    </div>
  `;

  card.querySelector(".star-btn").onclick = async e => {
    e.stopPropagation();
    isFav ? favorites.delete(f.id) : favorites.add(f.id);
    await saveFavorites();
    renderFriends(list);
  };

  card.querySelector(".friend-check").onchange = e => {
    card.classList.toggle("selected", e.target.checked);
    updateSelectedCount();
  };

  friendsListEl.appendChild(card);
}

}

function updateSelectedCount() {
  selectedCountEl.textContent =
    document.querySelectorAll(".friend-check:checked").length;
}


// =====================
// ROBLOX SERVER LOGIC
// =====================
async function getRobloxTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find(t => t.url && t.url.includes("roblox.com"));
}

function serverHasPlayers(s) {
  const ownerId = s.owner?.id;
  if (Array.isArray(s.playerTokens) && s.playerTokens.length > 0) return true;
  if (Array.isArray(s.players) && s.players.some(p => p.id !== ownerId)) return true;
  return false;
}

function ownerIsInside(s) {
  const ownerId = s.owner?.id;
  return Array.isArray(s.players) && ownerId && s.players.some(p => p.id === ownerId);
}

function countPlayersExcludingOwner(s) {
  const ownerId = s.owner?.id;
  if (Array.isArray(s.playerTokens) && s.playerTokens.length > 0) return s.playerTokens.length;
  if (Array.isArray(s.players)) return s.players.filter(p => p.id !== ownerId).length;
  return 0;
}



async function loadTotalsCache() {
  const cached = await storage.get("totalsCache");
  if (!cached) return false;
  if (Date.now() - cached.ts > CACHE_TTL_MS) return false;

  totalServers = cached.totalServers;
  serversWithPlayers = cached.serversWithPlayers;
  serversWithPlayersNoOwner = cached.serversWithPlayersNoOwner || 0;
  maxPages = cached.maxPages;

  updateTopStats();
  updatePageInfo();
  return true;
}

async function saveTotalsCache() {
  await storage.set("totalsCache", {
    ts: Date.now(),
    totalServers,
    serversWithPlayers,
    serversWithPlayersNoOwner,
    maxPages
  });
}

async function fetchTotals(options = {}) {
  const force = !!options.force;
  if (!force && skipTotalsCb?.checked) {
    await loadTotalsCache();
    return;
  }

  abortTotals = false;
  showLoading(true);
  setButtonsDisabled(true);
  loadingText.textContent = "Scanning private servers…";
  liveCount.textContent = "0 scanned";

  let cursor = "";
  let scanned = 0;
  let pages = 0;

  totalServers = 0;
  serversWithPlayers = 0;
  serversWithPlayersNoOwner = 0;
  maxPages = 1;

  while (!abortTotals) {
    const url = `https://games.roblox.com/v1/games/${PLACE_ID}/private-servers?limit=${LIMIT}&sortOrder=Desc&excludeFullGames=false&cursor=${cursor}`;
    const res = await fetch(url, { credentials: "include" });

    if (res.status === 429) {
      loadingText.textContent = "Rate limited… waiting 5s";
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      continue;
    }

    const json = await res.json();
    const data = json.data || [];
    pages++;
    scanned += data.length;
    totalServers += data.length;

    for (const s of data) {
      if (!serverHasPlayers(s)) continue;
      serversWithPlayers++;
      if (!ownerIsInside(s)) serversWithPlayersNoOwner++;
    }

    liveCount.textContent = `${scanned} scanned`;
    totalServersEl.textContent = String(totalServers);
    serversWithPlayersEl.textContent = String(serversWithPlayers);
    serversWithPlayersNoOwnerEl.textContent = String(serversWithPlayersNoOwner);

    if (!json.nextPageCursor) {
      cursor = "";
      break;
    }
    cursor = json.nextPageCursor;
  }

  if (!abortTotals) {
    maxPages = Math.max(1, pages);
    currentPage = 1;
    await saveTotalsCache();
    playDone();
    notify("Totals scan complete", "success");
  } else {
    notify("Totals scan skipped", "warn");
  }

  showLoading(false);
  setButtonsDisabled(false);
  updatePageInfo();
  setStatus("Ready");
}

function retrySameActionAfterRateLimit() {
  setStatus("Rate limited — retrying in 5s…");
  setButtonsDisabled(true);
  setTimeout(() => loadServers(pendingAction), RATE_LIMIT_MS);
}



let allSelected = false; // Add this variable at the top of your file

selectAllFriendsBtn.onclick = () => {
  playClick();
  const checkboxes = document.querySelectorAll(".friend-check:not(:disabled)");
  
  // Toggle the state
  allSelected = !allSelected;
  
  checkboxes.forEach(cb => {
    cb.checked = allSelected;
    cb.closest(".friend-card").classList.toggle("selected", allSelected);
  });

  // Update button text to show what it will do next
  selectAllFriendsBtn.textContent = allSelected ? "Unselect All" : "Select All (Safe)";
  updateSelectedCount();
};


async function performRemoval(idsToRemove) {
  if (!idsToRemove || idsToRemove.length === 0) {
    notify("No valid friends to remove.", "warn");
    return;
  }

  playClick();
  setButtonsDisabled(true);
  
  // Ensure we have a valid CSRF token before starting
  if (!csrfToken) await getCsrfToken();

  let count = 0;
  for (const userId of idsToRemove) {
    try {
      const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/unfriend`, {
        method: "POST",
        headers: { "X-CSRF-TOKEN": csrfToken },
        credentials: "include"
      });

      if (res.ok) {
        count++;
        // Remove from UI
        document.querySelector(`.friend-card[data-id="${userId}"]`)?.remove();
      } else if (res.status === 403) {
        // Token expired, refresh once and retry
        await getCsrfToken();
        const retry = await fetch(`https://friends.roblox.com/v1/users/${userId}/unfriend`, {
          method: "POST",
          headers: { "X-CSRF-TOKEN": csrfToken },
          credentials: "include"
        });
        if (retry.ok) count++;
      }
    } catch (e) {
      console.error("Failed to remove user:", userId, e);
    }
  }

  notify(`Successfully removed ${count} friends.`, "success");
  
  // Update local data and UI
  friendsList = friendsList.filter(f => !idsToRemove.includes(String(f.id)));
  friendCountEl.textContent = friendsList.length;
  updateSelectedCount();
  setButtonsDisabled(false);
}

const bulkModal = document.getElementById("bulkActionModal");

document.getElementById("removeSelected").onclick = () => {
  const selectedCheckboxes = document.querySelectorAll(".friend-check:checked");
  
  
  if (selectedCheckboxes.length === 0) {
    bulkModal.classList.remove("hidden");
    return;
  }

  
  if (confirm(`Remove ${selectedCheckboxes.length} selected friends?`)) {
    const ids = Array.from(selectedCheckboxes).map(cb => cb.closest(".friend-card").dataset.id);
    performRemoval(ids);
  }
};


document.getElementById("removeAllNoAccess").onclick = async () => {
  const idsToRemove = friendsList
    .filter(f => !accessibleOwnerIds.has(Number(f.id)) && !favorites.has(f.id))
    .map(f => String(f.id));

  if (idsToRemove.length === 0) {
    notify("No friends found without access.", "info");
    bulkModal.classList.add("hidden");
    return;
  }

  if (confirm(`This will remove ${idsToRemove.length} friends who do NOT give access. (Favorites are safe). Proceed?`)) {
    await performRemoval(idsToRemove);
    bulkModal.classList.add("hidden");
  }
};


document.getElementById("removeAllWithAccess").onclick = async () => {
  const idsToRemove = friendsList
    .filter(f => accessibleOwnerIds.has(Number(f.id)) && !favorites.has(f.id))
    .map(f => String(f.id));

  if (idsToRemove.length === 0) {
    notify("No friends found with access.", "info");
    bulkModal.classList.add("hidden");
    return;
  }

  if (confirm(`This will remove ${idsToRemove.length} friends who DO give access. (Favorites are safe). Proceed?`)) {
    await performRemoval(idsToRemove);
    bulkModal.classList.add("hidden");
  }
};
// Exit Option
document.getElementById("closeModal").onclick = () => {
  bulkModal.classList.add("hidden");
};

async function loadServers(action = {}) {
  if (loading) return;
  loading = true;

  pendingAction = {
    reset: !!action.reset,
    useCurrent: !!action.useCurrent,
    next: !!action.next
  };

  setButtonsDisabled(true);

  if (pendingAction.reset) {
    currentCursor = "";
    nextCursor = null;
    endReached = false;
    currentPage = 1;
  }

  const cursorToUse = pendingAction.useCurrent ? currentCursor : (pendingAction.next ? nextCursor : currentCursor);

  if (pendingAction.next && !nextCursor) {
    loading = false;
    setButtonsDisabled(false);
    notify("Last page reached", "warn");
    return;
  }

  showSkeletons();
  setStatus("Loading servers…");

  const url = `https://games.roblox.com/v1/games/${PLACE_ID}/private-servers?limit=${LIMIT}&sortOrder=Desc&excludeFullGames=false&cursor=${cursorToUse || ""}`;

  let res;
  try {
    res = await fetch(url, { credentials: "include" });
  } catch {
    loading = false;
    setButtonsDisabled(false);
    setStatus("Network error.");
    return;
  }

  if (res.status === 429) {
    loading = false;
    retrySameActionAfterRateLimit();
    return;
  }
  
  const json = await res.json();
  currentCursor = cursorToUse || "";
  nextCursor = json.nextPageCursor;
  endReached = !nextCursor;

  if (pendingAction.next) currentPage++;
  if (endReached && maxPages) currentPage = Math.min(currentPage, maxPages);

  serversDiv.innerHTML = "";
  let shown = 0;

  for (const s of json.data || []) {
    const ownerId = s.owner?.id;
    const hasOwnerInside = ownerIsInside(s);
    if (hasOwnerInside && !showOwnerInsideCb.checked) continue;
    if (!serverHasPlayers(s)) continue;
    const count = countPlayersExcludingOwner(s);
    if (onlyOnePlayerCb?.checked && count !== 1) continue;
     
    const card = document.createElement("div");
    card.className = "server animate__animated animate__fadeInUp";
    card.dataset.serverId = s.id;
    card.style.setProperty("--animate-duration", "0.22s");

    const warn = hasOwnerInside ? `<span class="danger" title="Dangerous! Has Owner Inside">⚠</span>` : "";
    const joinedBadge = lastJoinedServer?.id === s.id ? `<span class="joined-badge" data-joined-ts="${lastJoinedServer.ts}">Recently joined · ${timeAgo(lastJoinedServer.ts)}</span>` : "";

    card.innerHTML = `
      <div class="server-title">
        <span class="srvname">${s.name || "Unnamed Server"}</span>
        ${joinedBadge}
        ${warn}
      </div>
      <div class="server-meta">
        Owner: ${s.owner?.name || "Unknown"} • Players: ${count}
      </div>
      <button class="join">Join</button>
    `;

    const dangerEl = card.querySelector(".danger");
    if (dangerEl) {
      dangerEl.addEventListener("click", (e) => {
        e.stopPropagation();
        notify("Dangerous! Has Owner Inside", "warn");
      });
    }

    card.querySelector(".join").onclick = async () => {
      playClick();
      await saveLastJoined({ id: s.id, ts: Date.now() });
      document.querySelectorAll(".joined-badge").forEach(b => b.remove());
      
      const title = card.querySelector(".server-title");
      let badge = title.querySelector(".joined-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "joined-badge";
        badge.dataset.joinedTs = lastJoinedServer.ts;
        title.appendChild(badge);
      }
      badge.textContent = `Recently joined · ${timeAgo(lastJoinedServer.ts)}`;
      serversDiv.prepend(card);

      const robloxTab = await getRobloxTab();
      if (!robloxTab) {
        notify("Open Roblox tab first", "error");
        return;
      }

      if (useDeeplinkCb.checked) {
        const deeplink = `roblox://placeId=${PLACE_ID}&accessCode=${s.accessCode}`;
        chrome.tabs.update(robloxTab.id, { url: deeplink });
      } else {
        chrome.scripting.executeScript({
          target: { tabId: robloxTab.id },
          world: "MAIN",
          func: (placeId, code) => {
            if (window.Roblox?.GameLauncher?.joinPrivateGame) {
              Roblox.GameLauncher.joinPrivateGame(placeId, code, null);
            }
          },
          args: [PLACE_ID, s.accessCode]
        });
      }
      notify("Joining…", "success");
    };

    serversDiv.appendChild(card);
    shown++;
  }
   
  if (lastJoinedServer) {
    const pinnedCard = document.querySelector(`.server[data-server-id="${lastJoinedServer.id}"]`);
    if (pinnedCard && pinnedCard.parentElement.firstChild !== pinnedCard) {
      pinnedCard.parentElement.prepend(pinnedCard);
    }
  }
  updateTopStats();
  updatePageInfo();

  setStatus(shown === 0 ? "No servers found." : endReached ? `Loaded ${shown} servers. (Last page)` : `Loaded ${shown} servers.`);
  loading = false;
  setButtonsDisabled(false);
}

// =====================
// EVENTS
// =====================
document.getElementById("firstPage").onclick = () => { playClick(); loadServers({ reset: true }); };
document.getElementById("refreshCurrent").onclick = () => { playClick(); loadServers({ useCurrent: true }); };
document.getElementById("next").onclick = () => { playClick(); loadServers({ next: true }); };

if (scanTotalsAgainBtn) scanTotalsAgainBtn.onclick = async () => {
  playClick();
  await fetchTotals({ force: true });
};

skipScanBtn.onclick = () => {
  abortTotals = true;
  showLoading(false);
  setButtonsDisabled(false);
  playDone();
};

// =====================
// INIT
// =====================
(async () => {
  await loadLastJoined();
  await loadFavorites();
  
  const savedSettings = await settingsStore.load();
  if (savedSettings.skipTotals !== undefined) skipTotalsCb.checked = savedSettings.skipTotals;
  if (savedSettings.showOwnerInside !== undefined) showOwnerInsideCb.checked = savedSettings.showOwnerInside;
  if (savedSettings.onlyOnePlayer !== undefined && onlyOnePlayerCb) onlyOnePlayerCb.checked = savedSettings.onlyOnePlayer;
  if (savedSettings.useDeeplink !== undefined) useDeeplinkCb.checked = savedSettings.useDeeplink;

  setInterval(() => {
    if (!lastJoinedServer) return;
    const badge = document.querySelector(`.server[data-server-id="${lastJoinedServer.id}"] .joined-badge`);
    if (!badge) return;
    badge.textContent = `Recently joined · ${timeAgo(lastJoinedServer.ts)}`;
  }, 1000);

  await loadTotalsCache();
  updateTopStats();
  updatePageInfo();

  if (!skipTotalsCb.checked) await fetchTotals();
  await loadServers({ reset: true });
})();