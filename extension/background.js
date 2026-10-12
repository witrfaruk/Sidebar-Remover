// Do not redirect on install / download
// Keep uninstall feedback redirect exactly where already set

// Open the feedback page when the extension is removed
chrome.runtime.setUninstallURL("https://witrfaruk.vercel.app/extension/Sidebar-Remover-feedback?utm_source=sidebar_remover_extension&utm_medium=extension&utm_campaign=uninstall_feedback");

// Synchronize tab state on navigation without continuous polling
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    chrome.tabs.sendMessage(tabId, { type: "sbr:sync_settings" }).catch(() => {});
  }
});
