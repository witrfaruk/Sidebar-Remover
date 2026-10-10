const DEFAULTS = {
  globalEnabled: false,      // Hide sidebar by default: OFF
  hideScrollbars: true,     // Hide scrollbars by default: ON
  allowlist: [],            // Hosts where sidebar is hidden
  blocklist: [],            // Hosts where sidebar is kept
  scrollAllowlist: [],      // Hosts where scrollbars are hidden
  scrollBlocklist: []       // Hosts where scrollbars are kept
};

const $ = (id) => document.getElementById(id);
let host = "";
let tabId = null;

const getSettings = async () => {
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    return { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  }
  try {
    const raw = localStorage.getItem("sbr_settings");
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
};

const saveSettings = async (data) => {
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    await chrome.storage.local.set(data);
  } else {
    const s = await getSettings();
    localStorage.setItem("sbr_settings", JSON.stringify({ ...s, ...data }));
  }
};

function isSidebarHidden(s, h) {
  if (!h) return s.globalEnabled;
  return s.globalEnabled ? !s.blocklist.includes(h) : s.allowlist.includes(h);
}

function isScrollHidden(s, h) {
  if (!h) return s.hideScrollbars;
  return s.hideScrollbars ? !s.scrollBlocklist.includes(h) : s.scrollAllowlist.includes(h);
}

async function render() {
  const s = await getSettings();

  // Current Site Toggles
  $("scrollToggle").checked = isScrollHidden(s, host);
  $("sidebarToggle").checked = isSidebarHidden(s, host);

  // Default Settings Toggles
  $("defaultSidebarToggle").checked = !!s.globalEnabled;
  $("defaultScrollToggle").checked = !!s.hideScrollbars;
}

// 1. Current Site: Hide Scrollbars
$("scrollToggle").onchange = async (e) => {
  const s = await getSettings();
  const isChecked = e.target.checked;
  let scrollAllow = (s.scrollAllowlist || []).filter((x) => x !== host);
  let scrollBlock = (s.scrollBlocklist || []).filter((x) => x !== host);

  if (s.hideScrollbars) {
    if (!isChecked && host) scrollBlock.push(host);
  } else {
    if (isChecked && host) scrollAllow.push(host);
  }

  await saveSettings({ scrollAllowlist: scrollAllow, scrollBlocklist: scrollBlock });
};

// 2. Current Site: Hide Sidebar
$("sidebarToggle").onchange = async (e) => {
  const s = await getSettings();
  const isChecked = e.target.checked;
  let allow = (s.allowlist || []).filter((x) => x !== host);
  let block = (s.blocklist || []).filter((x) => x !== host);

  if (s.globalEnabled) {
    if (!isChecked && host) block.push(host);
  } else {
    if (isChecked && host) allow.push(host);
  }

  await saveSettings({ allowlist: allow, blocklist: block });
};

// 3. Settings View: Hide sidebar by default
$("defaultSidebarToggle").onchange = async (e) => {
  await saveSettings({ globalEnabled: e.target.checked });
  render();
};

// 4. Settings View: Hide scrollbar by default
$("defaultScrollToggle").onchange = async (e) => {
  await saveSettings({ hideScrollbars: e.target.checked });
  render();
};

// 5. Navigation between views
$("openSettingsBtn").onclick = () => {
  $("mainView").classList.remove("active");
  $("settingsView").classList.add("active");
};

$("closeSettingsBtn").onclick = () => {
  $("settingsView").classList.remove("active");
  $("mainView").classList.add("active");
};

// 6. Initialize Tab & Host
(async () => {
  if (typeof chrome !== "undefined" && chrome?.tabs?.query) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        tabId = tab.id;
        const u = new URL(tab.url || "");
        if (u.protocol === "http:" || u.protocol === "https:") {
          host = u.hostname.replace(/^www\./, "");
        }
      }
    } catch {}
  }
  render();
})();
