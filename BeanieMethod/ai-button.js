// The popup's "AI Editor" button: opens the editor in a full tab (or brings the open one forward).
// Kept apart from popup.js so it always works, whatever the rest of the popup is doing.
document.getElementById("openAiEditor").addEventListener("click", async () => {
  const url = chrome.runtime.getURL("ai/editor.html");
  try {
    const [open] = await chrome.tabs.query({ url });
    if (open) {
      await chrome.tabs.update(open.id, { active: true });
      await chrome.windows.update(open.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url });
    }
  } catch (e) {
    window.open(url, "_blank");
  }
  window.close();
});
