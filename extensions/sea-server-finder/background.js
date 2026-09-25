// Sea Server Finder — background service worker
// Looks up where an IP address is (city, country, coordinates) for the
// content script, and caches the answers so each server address is only
// looked up once. The lookups run here rather than on the Roblox page so the
// page's own security rules (CORS) never get in the way.

const GEO_URL = "https://ipwho.is/";
const SELF_TTL_MS = 60 * 60 * 1000; // re-check the player's own location hourly

async function readCache(key) {
  const stored = await chrome.storage.local.get(key);
  return stored[key];
}

async function writeCache(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

async function lookup(ip) {
  const key = ip ? "geo:" + ip : "geo:self";
  const cached = await readCache(key);
  if (cached && (ip || Date.now() - cached.at < SELF_TTL_MS)) return cached;

  const res = await fetch(GEO_URL + (ip ? encodeURIComponent(ip) : ""));
  if (!res.ok) throw new Error("Location lookup failed (" + res.status + ")");
  const body = await res.json();
  if (!body.success) throw new Error(body.message || "Location lookup failed");

  const geo = {
    at: Date.now(),
    city: body.city || "",
    region: body.region || "",
    country: body.country || "",
    countryCode: body.country_code || "",
    lat: body.latitude,
    lon: body.longitude,
  };
  await writeCache(key, geo);
  return geo;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "geo") {
    lookup(msg.ip || "")
      .then((geo) => sendResponse({ ok: true, geo }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true; // keep the channel open for the async answer
  }
  return false;
});

// Clicking the toolbar icon opens the panel on a Roblox tab, or takes the
// player to Blox Fruits if they are somewhere else.
chrome.action.onClicked.addListener(async (tab) => {
  const onRoblox = tab && tab.url && tab.url.startsWith("https://www.roblox.com/");
  if (onRoblox) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "toggle" });
      return;
    } catch (_) {
      // the content script is not loaded yet on this tab (e.g. it was open
      // before the extension was installed): fall through and reload it
    }
    chrome.tabs.reload(tab.id);
    return;
  }
  chrome.tabs.create({ url: "https://www.roblox.com/games/2753915549/Blox-Fruits?ssf=open" });
});
