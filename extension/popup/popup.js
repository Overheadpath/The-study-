const MESSAGE_TYPES = {
  GET_STATUS: 'GET_STATUS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
};

const statusLine = document.getElementById('statusLine');
const resultLine = document.getElementById('result');
const autoRefreshEnabled = document.getElementById('autoRefreshEnabled');
const refreshIntervalSeconds = document.getElementById('refreshIntervalSeconds');
const notifyOnMissingBrainrot = document.getElementById('notifyOnMissingBrainrot');
const saveBtn = document.getElementById('saveBtn');

async function loadStatus() {
  const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_STATUS });
  if (!response?.ok) {
    statusLine.textContent = `Status unavailable: ${response?.error || 'Unknown error'}`;
    return;
  }

  const { settings, runtime } = response.data;
  autoRefreshEnabled.checked = Boolean(settings.autoRefreshEnabled);
  refreshIntervalSeconds.value = Number(settings.refreshIntervalSeconds) || 45;
  notifyOnMissingBrainrot.checked = Boolean(settings.notifyOnMissingBrainrot);

  statusLine.textContent = runtime.hasScanData
    ? `Last scan: ${runtime.lastScanAt}`
    : 'No scan data yet (open a Roblox game tab).';
}

async function saveSettings() {
  saveBtn.disabled = true;
  resultLine.textContent = 'Saving…';

  const payload = {
    autoRefreshEnabled: autoRefreshEnabled.checked,
    refreshIntervalSeconds: Number(refreshIntervalSeconds.value),
    notifyOnMissingBrainrot: notifyOnMissingBrainrot.checked,
  };

  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.UPDATE_SETTINGS,
    payload,
  });

  if (!response?.ok) {
    resultLine.textContent = `Save failed: ${response?.error || 'Unknown error'}`;
    saveBtn.disabled = false;
    return;
  }

  resultLine.textContent = 'Settings saved.';
  saveBtn.disabled = false;
}

saveBtn.addEventListener('click', () => {
  saveSettings().catch((error) => {
    resultLine.textContent = `Save failed: ${error.message}`;
    saveBtn.disabled = false;
  });
});

loadStatus().catch((error) => {
  statusLine.textContent = `Status unavailable: ${error.message}`;
});
