/* Saving projects, clips, sounds and settings in the browser (IndexedDB). Nothing leaves the PC. */

const DB_NAME = "beanie-pro-ai";
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
        if (!db.objectStoreNames.contains("sounds")) db.createObjectStore("sounds", { keyPath: "name" });
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(storeName, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    const req = fn(store);
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Saving failed."));
  });
}

export const store = {
  getProject: (id) => run("projects", "readonly", (s) => s.get(id)),
  putProject: (data) => run("projects", "readwrite", (s) => s.put(data)),
  listProjects: () => run("projects", "readonly", (s) => s.getAll()),
  async deleteProject(id) {
    await run("projects", "readwrite", (s) => s.delete(id));
    await run("files", "readwrite", (s) => {
      s.delete(`src:${id}`);
      return s.delete(`thumbs:${id}`);
    });
  },
  getFile: (key) => run("files", "readonly", (s) => s.get(key)),
  putFile: (key, blob) => run("files", "readwrite", (s) => s.put(blob, key)),
  listSounds: () => run("sounds", "readonly", (s) => s.getAll()),
  putSound: (record) => run("sounds", "readwrite", (s) => s.put(record)),
  deleteSound: (name) => run("sounds", "readwrite", (s) => s.delete(name)),
  get: (key) => run("kv", "readonly", (s) => s.get(key)),
  set: (key, value) => run("kv", "readwrite", (s) => s.put(value, key)),
};

export const DEFAULT_SETTINGS = {
  brain: "auto",                     // auto, chrome, ollama, basic
  ollama_url: "http://127.0.0.1:11434",
  model: "gemma3:4b",
  instant_commands: true,
};

export async function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...((await store.get("settings")) || {}) };
}

export async function saveSettings(settings) {
  await store.set("settings", { ...settings });
}
