const DEFAULTS = {
  globalEnabled: false,      // Hide sidebar by default: OFF
  hideScrollbars: true,      // Hide scrollbars by default: ON
  sitePreferences: {},       // { [hostname]: { sidebar: bool, scrollbars: bool } }
  allowlist: [],            // Hosts where sidebar is hidden
  blocklist: [],            // Hosts where sidebar is kept
  scrollAllowlist: [],      // Hosts where scrollbars are hidden
  scrollBlocklist: []       // Hosts where scrollbars are kept
};

const $ = (id) => document.getElementById(id);
let host = "";
let tabId = null;
let currentSettings = { ...DEFAULTS };

const getSettings = async () => {
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    const s = await chrome.storage.local.get(DEFAULTS);
    currentSettings = { ...DEFAULTS, ...s };
    return currentSettings;
  }
  try {
    const raw = localStorage.getItem("sbr_settings");
    currentSettings = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    return currentSettings;
  } catch {
    return DEFAULTS;
  }
};

const saveSettings = async (data) => {
  currentSettings = { ...currentSettings, ...data };
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    await chrome.storage.local.set(data);
  } else {
    try {
      localStorage.setItem("sbr_settings", JSON.stringify(currentSettings));
    } catch {}
  }
};

function isSidebarHidden(s, h) {
  if (h && s.sitePreferences?.[h]?.sidebar !== undefined) {
    return !!s.sitePreferences[h].sidebar;
  }
  if (!h) return !!s.globalEnabled;
  if ((s.blocklist || []).includes(h)) return false;
  if ((s.allowlist || []).includes(h)) return true;
  return !!s.globalEnabled;
}

function isScrollHidden(s, h) {
  if (h && s.sitePreferences?.[h]?.scrollbars !== undefined) {
    return !!s.sitePreferences[h].scrollbars;
  }
  if (!h) return s.hideScrollbars !== false;
  if ((s.scrollBlocklist || []).includes(h)) return false;
  if ((s.scrollAllowlist || []).includes(h)) return true;
  return s.hideScrollbars !== false;
}

// Send instant message to content script with auto-reconnection
function notifyTab(target, value) {
  if (tabId && typeof chrome !== "undefined" && chrome?.tabs?.sendMessage) {
    chrome.tabs.sendMessage(tabId, { type: "sbr:quick_toggle", target, value }, () => {
      if (chrome.runtime?.lastError && chrome.scripting?.executeScript) {
        chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"]
        }).then(() => {
          chrome.tabs.sendMessage(tabId, { type: "sbr:quick_toggle", target, value }).catch(() => {});
        }).catch(() => {});
      }
    });
  }
}

// Broadcast settings sync to all tabs when global defaults change
function broadcastSync() {
  if (typeof chrome !== "undefined" && chrome?.tabs?.query) {
    chrome.tabs.query({}, (tabs) => {
      for (const t of tabs) {
        if (t.id) {
          chrome.tabs.sendMessage(t.id, { type: "sbr:sync_settings" }).catch(() => {});
        }
      }
    });
  }
}

function render(s) {
  const hostDisplay = $("currentHost");
  const footnote = $("siteFootnote");

  if (host) {
    if (hostDisplay) {
      hostDisplay.textContent = host;
      hostDisplay.title = host;
    }
    if (footnote) {
      footnote.textContent = "CHANGES APPLY TO THIS WEBSITE ONLY";
    }

    $("scrollToggle").disabled = false;
    $("sidebarToggle").disabled = false;
    $("scrollToggle").checked = isScrollHidden(s, host);
    $("sidebarToggle").checked = isSidebarHidden(s, host);
  } else {
    if (hostDisplay) {
      hostDisplay.textContent = "No website";
      hostDisplay.title = "Browser page or internal tab";
    }
    if (footnote) {
      footnote.textContent = "GLOBAL CONTROLS (CLICK TO TOGGLE)";
    }

    $("scrollToggle").disabled = false;
    $("sidebarToggle").disabled = false;
    $("scrollToggle").checked = isScrollHidden(s, "");
    $("sidebarToggle").checked = isSidebarHidden(s, "");
  }
}

// 1. Hide Scrollbars Toggle
$("scrollToggle").onchange = async (e) => {
  const isChecked = e.target.checked;
  const s = currentSettings;

  notifyTab("scrollbars", isChecked);

  if (host) {
    const sitePrefs = { ...(s.sitePreferences || {}) };
    sitePrefs[host] = {
      ...(sitePrefs[host] || {}),
      scrollbars: isChecked
    };

    let allow = (s.scrollAllowlist || []).filter((x) => x !== host);
    let block = (s.scrollBlocklist || []).filter((x) => x !== host);
    if (isChecked) allow.push(host); else block.push(host);

    await saveSettings({
      sitePreferences: sitePrefs,
      scrollAllowlist: allow,
      scrollBlocklist: block
    });
  } else {
    await saveSettings({ hideScrollbars: isChecked });
  }
  broadcastSync();
};

// 2. Hide Sidebar Toggle
$("sidebarToggle").onchange = async (e) => {
  const isChecked = e.target.checked;
  const s = currentSettings;

  notifyTab("sidebar", isChecked);

  if (host) {
    const sitePrefs = { ...(s.sitePreferences || {}) };
    sitePrefs[host] = {
      ...(sitePrefs[host] || {}),
      sidebar: isChecked
    };

    let allow = (s.allowlist || []).filter((x) => x !== host);
    let block = (s.blocklist || []).filter((x) => x !== host);
    if (isChecked) allow.push(host); else block.push(host);

    await saveSettings({
      sitePreferences: sitePrefs,
      allowlist: allow,
      blocklist: block
    });
  } else {
    await saveSettings({ globalEnabled: isChecked });
  }
  broadcastSync();
};

// 3. Support View Toggle
const mainView = $("mainView");
const supportView = $("supportView");
const supportBtn = $("supportBtn");
const supportBackBtn = $("supportBackBtn");
const popupFooter = $("popupFooter");

if (supportBtn) {
  supportBtn.addEventListener("click", () => {
    if (mainView) mainView.style.display = "none";
    if (supportView) supportView.style.display = "block";
    if (popupFooter) popupFooter.style.display = "none";
  });
}

if (supportBackBtn) {
  supportBackBtn.addEventListener("click", () => {
    if (supportView) supportView.style.display = "none";
    if (mainView) mainView.style.display = "block";
    if (popupFooter) popupFooter.style.display = "block";
  });
}

function openExternalUrl(url) {
  if (typeof chrome !== "undefined" && chrome?.tabs?.create) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, "_blank");
  }
}

// 4. Footer link openers
const donateLink = $("donateLink");
if (donateLink) {
  donateLink.addEventListener("click", (e) => {
    e.preventDefault();
    openExternalUrl("https://ko-fi.com/witrfaruk?utm_source=sidebar_remover_extension&utm_medium=extension&utm_campaign=donation");
  });
}

const requestFeatureLink = $("requestFeatureLink");
if (requestFeatureLink) {
  requestFeatureLink.addEventListener("click", (e) => {
    e.preventDefault();
    openExternalUrl("https://docs.google.com/forms/d/e/1FAIpQLSdqzdboXmtKLeK9AhMB_0dH27BehWKFtk0tlv02W5x7f0F8Fw/viewform?usp=header");
  });
}

const supportEmailLink = $("supportEmailLink");
if (supportEmailLink) {
  supportEmailLink.addEventListener("click", (e) => {
    e.preventDefault();
    openExternalUrl("mailto:witrfaruk@proton.me");
  });
}

const madeByLink = $("madeByLink");
if (madeByLink) {
  madeByLink.addEventListener("click", (e) => {
    e.preventDefault();
    openExternalUrl("https://witrfaruk.vercel.app/?utm_source=sidebar_remover_extension&utm_medium=extension&utm_campaign=creator_credit");
  });
}

document.querySelectorAll('a[target="_blank"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    openExternalUrl(a.href);
  });
});

// 5. Resolve active tab & extract real hostname
async function resolveActiveTab() {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) {
    host = "";
    return;
  }

  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("devtools://")) {
      const [focusedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (focusedTab && focusedTab.url && !focusedTab.url.startsWith("chrome-extension://")) {
        tab = focusedTab;
      }
    }

    if (tab && (tab.url || tab.pendingUrl)) {
      tabId = tab.id;
      const rawUrl = tab.url || tab.pendingUrl || "";
      let u = null;
      try {
        u = new URL(rawUrl);
      } catch {}

      if (u && (u.protocol === "http:" || u.protocol === "https:")) {
        host = u.hostname.replace(/^www\./i, "");
      } else if (u && u.protocol === "file:") {
        host = "Local File";
      } else {
        host = "";
      }
    } else {
      host = "";
    }
  } catch (err) {
    console.error("Tab resolution error:", err);
    host = "";
  }
}

(async () => {
  const [, s] = await Promise.all([resolveActiveTab(), getSettings()]);
  render(s);
})();
