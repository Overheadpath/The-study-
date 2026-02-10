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
  ACTIVITY_LOG: 'beaniePro.activityLog',
};

const MESSAGE_TYPES = {
  UPSERT_SESSION_SCAN: 'UPSERT_SESSION_SCAN',
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  GET_STATUS: 'GET_STATUS',
};

function sanitizeSettings(partial) {
  const next = { ...partial };

  if (next.refreshIntervalSeconds !== undefined) {
    next.refreshIntervalSeconds = Math.max(10, Math.min(300, Number(next.refreshIntervalSeconds) || 45));
  }

  if (next.maxBulkActionsPerRun !== undefined) {
    next.maxBulkActionsPerRun = Math.max(1, Math.min(100, Number(next.maxBulkActionsPerRun) || 15));
  }

  if (next.minBulkActionDelayMs !== undefined) {
    next.minBulkActionDelayMs = Math.max(250, Math.min(10000, Number(next.minBulkActionDelayMs) || 900));
  }

  ['autoRefreshEnabled', 'notifyOnMissingBrainrot', 'musicEnabled', 'dryRunByDefault'].forEach((key) => {
    if (next[key] !== undefined) next[key] = Boolean(next[key]);
  });

  return next;
}

async function appendToLog(event) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVITY_LOG);
  const current = result[STORAGE_KEYS.ACTIVITY_LOG] || [];
  const next = [...current, { ...event, at: new Date().toISOString() }].slice(-500);
  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVITY_LOG]: next });
}

async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
}

async function updateSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...sanitizeSettings(partial || {}) };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
  await appendToLog({ type: 'SETTINGS_UPDATED', payload: partial || {} });
  return next;
}

async function getStatus() {
  const [settings, scanResult] = await Promise.all([
    getSettings(),
    chrome.storage.local.get(STORAGE_KEYS.SESSION_SCAN),
  ]);

  const scan = scanResult[STORAGE_KEYS.SESSION_SCAN] || null;
  return {
    settings,
    sessionScan: scan,
    runtime: {
      lastScanAt: scan ? scan.scannedAt : null,
      hasScanData: Boolean(scan),
    },
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
  await appendToLog({ type: 'EXTENSION_INSTALLED' });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === MESSAGE_TYPES.GET_SETTINGS) {
      sendResponse({ ok: true, data: await getSettings() });
      return;
    }

    if (message?.type === MESSAGE_TYPES.UPDATE_SETTINGS) {
      sendResponse({ ok: true, data: await updateSettings(message.payload || {}) });
      return;
    }

    if (message?.type === MESSAGE_TYPES.GET_STATUS) {
      sendResponse({ ok: true, data: await getStatus() });
      return;
    }

    if (message?.type === MESSAGE_TYPES.UPSERT_SESSION_SCAN) {
      const payload = message.payload || {};
      await chrome.storage.local.set({
        [STORAGE_KEYS.SESSION_SCAN]: {
          serverId: payload.serverId || 'public_or_unknown',
          players: Array.isArray(payload.players) ? payload.players : [],
          detectedBrainrots: Array.isArray(payload.detectedBrainrots) ? payload.detectedBrainrots : [],
          accessSignals: Array.isArray(payload.accessSignals) ? payload.accessSignals : [],
          scannedAt: new Date().toISOString(),
          sourceTabId: sender?.tab?.id || null,
          sourceUrl: sender?.tab?.url || null,
        },
      });

      await appendToLog({
        type: 'SESSION_SCAN_UPSERTED',
        payload: {
          serverId: payload.serverId || 'public_or_unknown',
          tabId: sender?.tab?.id || null,
        },
      });

      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: 'Unknown message type' });
  })().catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
