function getSessionSignals() {
  return {
    serverId: new URLSearchParams(window.location.search).get('privateServerLinkCode') || 'public_or_unknown',
    players: [],
    detectedBrainrots: [],
    accessSignals: [],
  };
}

async function postSessionSnapshot() {
  const payload = getSessionSignals();
  await chrome.runtime.sendMessage({
    type: 'UPSERT_SESSION_SCAN',
    payload,
  });
}

function boot() {
  // This is intentionally conservative in phase 0:
  // we only emit a minimal session heartbeat and do not automate interactions.
  postSessionSnapshot().catch(() => {
    // Silent fail to avoid disrupting normal page use.
  });
}

boot();
