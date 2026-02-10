const DEFAULT_SETTINGS = {
  autoRefreshEnabled: true,
  refreshIntervalSeconds: 45,
  notifyOnMissingBrainrot: true,
  musicEnabled: false,
  maxBulkActionsPerRun: 15,
  minBulkActionDelayMs: 900,
  dryRunByDefault: true,
};

const STORAGE_KEYS = {
  SETTINGS: 'beaniePro.settings',
  SESSION_SCAN: 'beaniePro.sessionScan',
};

async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
}

async function updateSettings(partial) {
  const next = { ...(await getSettings()), ...(partial || {}) };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
  return next;
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'GET_SETTINGS') {
      sendResponse({ ok: true, data: await getSettings() });
      return;
    }

    if (message?.type === 'UPDATE_SETTINGS') {
      sendResponse({ ok: true, data: await updateSettings(message.payload || {}) });
      return;
    }

    if (message?.type === 'UPSERT_SESSION_SCAN') {
      await chrome.storage.local.set({
        [STORAGE_KEYS.SESSION_SCAN]: {
          ...(message.payload || {}),
          scannedAt: new Date().toISOString(),
          sourceTabId: sender?.tab?.id || null,
        },
      });
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: 'Unknown message type' });
  })().catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
