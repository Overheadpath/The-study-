const { DEFAULT_SETTINGS, STORAGE_KEYS } = require('../core/constants');

function getStorageArea() {
  if (!globalThis.chrome || !chrome.storage || !chrome.storage.local) {
    throw new Error('chrome.storage.local is unavailable.');
  }

  return chrome.storage.local;
}

async function read(key, fallback) {
  const storage = getStorageArea();
  const result = await storage.get(key);
  if (result[key] === undefined) return fallback;
  return result[key];
}

async function write(key, value) {
  const storage = getStorageArea();
  await storage.set({ [key]: value });
  return value;
}

async function appendToLog(event) {
  const now = new Date().toISOString();
  const logEntry = { ...event, at: now };
  const current = await read(STORAGE_KEYS.ACTIVITY_LOG, []);
  const next = [...current, logEntry].slice(-500);
  await write(STORAGE_KEYS.ACTIVITY_LOG, next);
  return logEntry;
}

async function getSettings() {
  const stored = await read(STORAGE_KEYS.SETTINGS, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function updateSettings(partialSettings) {
  const current = await getSettings();
  const next = { ...current, ...partialSettings };
  await write(STORAGE_KEYS.SETTINGS, next);
  await appendToLog({ type: 'SETTINGS_UPDATED', payload: partialSettings });
  return next;
}

module.exports = {
  appendToLog,
  getSettings,
  read,
  updateSettings,
  write,
};
