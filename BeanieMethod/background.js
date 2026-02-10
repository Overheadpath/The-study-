// Background service worker for Beanie Pro
// Handles notifications and background tasks

let missingBrainrots = [];

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GAME_EVENT') {
    handleGameEvent(request);
  } else if (request.type === 'CHECK_BRAINROTS') {
    checkAndNotifyBrainrots(request.userId);
  } else if (request.type === 'UPDATE_MISSING_BRAINROTS') {
    missingBrainrots = request.missing || [];
  }
  return true;
});

// Handle game join events
function handleGameEvent(event) {
  if (event.event === 'game_joined') {
    // Notify popup to check Brainrots
    chrome.runtime.sendMessage({
      type: 'TRIGGER_BRAINROT_CHECK'
    }).catch(() => {});
  }
}

// Send desktop notification for missing Brainrots
function sendBrainrotNotification(count) {
  if (count === 0) return;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Beanie Pro - Missing Brainrots!',
    message: `You're missing ${count} Brainrot${count > 1 ? 's' : ''} in this server!`,
    priority: 2
  });
}

// Check Brainrots and notify
async function checkAndNotifyBrainrots(userId) {
  if (missingBrainrots.length > 0) {
    sendBrainrotNotification(missingBrainrots.length);
  }
}

// Installation/update handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Beanie Pro installed!');
  } else if (details.reason === 'update') {
    console.log('Beanie Pro updated to v2.0!');
  }
});