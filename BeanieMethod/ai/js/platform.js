/* The few things that need Chrome's extension powers, with fallbacks so the editor also works as a
 * plain web page (that's how it's tested with real Chrome).
 */

const ext = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.id ? globalThis.chrome : null;

export const isExtension = Boolean(ext);

export const OLLAMA_RULE_ID = 11434;

/**
 * Ollama refuses requests that come with a browser extension's Origin header. This rule removes the
 * header, only for Beanie Pro's own requests to this PC (127.0.0.1 / localhost).
 */
export async function allowOllama() {
  if (!ext || !ext.declarativeNetRequest) return false;
  await ext.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [OLLAMA_RULE_ID],
    addRules: [{
      id: OLLAMA_RULE_ID,
      priority: 1,
      action: { type: "modifyHeaders", requestHeaders: [{ header: "origin", operation: "remove" }] },
      condition: {
        requestDomains: ["127.0.0.1", "localhost"],
        initiatorDomains: [ext.runtime.id],
        resourceTypes: ["xmlhttprequest", "other"],
      },
    }],
  });
  return true;
}

/** Highest n used in Beanie_steal<n>_... downloads, so new exports keep counting up. */
export async function lastExportNumber(fallback = 0) {
  let highest = fallback;
  if (ext && ext.downloads) {
    try {
      const items = await ext.downloads.search({ filenameRegex: "Beanie_steal\\d+_", limit: 500 });
      for (const it of items) {
        const m = /Beanie_steal(\d+)_/.exec(it.filename || "");
        if (m) highest = Math.max(highest, parseInt(m[1], 10));
      }
    } catch (e) { /* keep the fallback */ }
  }
  return highest;
}

export function exportName(n, date = new Date()) {
  const p = (x) => String(x).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
  return `Beanie_steal${n}_${stamp}.mp4`;
}

/** Save a finished video to Downloads/Beanie Pro. Returns a download id (or null). */
export async function saveVideo(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    if (ext && ext.downloads) {
      const id = await ext.downloads.download({ url, filename: `Beanie Pro/${filename}`, saveAs: false, conflictAction: "uniquify" });
      await waitForDownload(id);
      return id;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    await new Promise((r) => setTimeout(r, 1500));
    return null;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

function waitForDownload(id) {
  return new Promise((resolve) => {
    const check = async () => {
      const [item] = await ext.downloads.search({ id });
      if (!item || item.state !== "in_progress") {
        ext.downloads.onChanged.removeListener(onChanged);
        resolve(item);
      }
    };
    const onChanged = (delta) => { if (delta.id === id && delta.state) check(); };
    ext.downloads.onChanged.addListener(onChanged);
    check();
  });
}

/** Open the folder with a saved video (extension only). */
export function showDownload(id) {
  if (ext && ext.downloads && id !== null && id !== undefined) {
    ext.downloads.show(id);
    return true;
  }
  return false;
}

export async function downloadExists(id) {
  if (!ext || !ext.downloads || id === null || id === undefined) return false;
  const [item] = await ext.downloads.search({ id });
  return Boolean(item && item.exists !== false && item.state === "complete");
}
