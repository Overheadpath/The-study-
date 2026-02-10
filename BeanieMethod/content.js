// Content script for in-game Brainrot detection
// Runs on Roblox game pages to detect when player enters a server

(function() {
  'use strict';

  const PLACE_ID = '109983668079237';
  let detectionActive = false;

  // Check if we're on the correct game
  function isCorrectGame() {
    return window.location.href.includes(PLACE_ID);
  }

  // Monitor for game join
  function monitorGameJoin() {
    if (detectionActive) return;
    detectionActive = true;

    // Look for Roblox game container
    const observer = new MutationObserver((mutations) => {
      const gameFrame = document.querySelector('#game-frame, iframe[id*="game"]');
      if (gameFrame && isCorrectGame()) {
        notifyExtension('game_joined');
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Send message to extension
  function notifyExtension(event) {
    chrome.runtime.sendMessage({
      type: 'GAME_EVENT',
      event: event,
      placeId: PLACE_ID,
      timestamp: Date.now()
    }).catch(e => console.log('Extension context invalidated'));
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', monitorGameJoin);
  } else {
    monitorGameJoin();
  }

  // Listen for messages from extension
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'CHECK_GAME_STATUS') {
      sendResponse({
        inGame: isCorrectGame(),
        url: window.location.href
      });
    }
    return true;
  });
})();