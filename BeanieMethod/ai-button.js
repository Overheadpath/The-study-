// The popup's "AI Editor" buttons: open the editor in a full tab (or bring the open one forward).
// Kept apart from popup.js so they always work, whatever the rest of the popup is doing.
async function openAiEditor() {
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
}

for (const id of ["openAiEditor", "openAiEditorScanning"]) {
  const button = document.getElementById(id);
  if (button) button.addEventListener("click", openAiEditor);
}
