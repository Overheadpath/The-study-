const MESSAGE_TYPES = {
  UPSERT_SESSION_SCAN: 'UPSERT_SESSION_SCAN',
  GET_SETTINGS: 'GET_SETTINGS',
};

function getSessionSignals() {
  return {
    serverId: new URLSearchParams(window.location.search).get('privateServerLinkCode') || 'public_or_unknown',
    players: [],
    detectedBrainrots: [],
    accessSignals: [],
  };
}

async function getSettings() {
  const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS });
  if (!response || !response.ok) {
    return {
      autoRefreshEnabled: true,
      refreshIntervalSeconds: 45,
    };
  }

  return response.data;
}

async function postSessionSnapshot() {
  const payload = getSessionSignals();
  await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.UPSERT_SESSION_SCAN,
    payload,
  });
}

async function boot() {
  // Conservative phase-0 behavior: read-only heartbeat only.
  await postSessionSnapshot();

  const settings = await getSettings();
  if (!settings.autoRefreshEnabled) return;

  const intervalMs = Math.max(10, Number(settings.refreshIntervalSeconds) || 45) * 1000;
  setInterval(() => {
    postSessionSnapshot().catch(() => {
      // Silent fail to avoid disrupting normal page use.
    });
  }, intervalMs);
}

boot().catch(() => {
  // Silent fail to avoid disrupting normal page use.
});
