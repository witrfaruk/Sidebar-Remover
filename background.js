// Open the welcome page on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "https://witrfaruk.vercel.app/extension/Sidebar-Remover" });
  }
});

// Open the feedback page when the extension is removed
chrome.runtime.setUninstallURL("https://witrfaruk.vercel.app/extension/Sidebar-Remover-feedback");
