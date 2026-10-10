const DEFAULTS = { globalEnabled: true, allowlist: [], blocklist: [], hideScrollbars: true };
const $ = (id) => document.getElementById(id);
let tabId = null;
let host = null;

const normalize = (h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

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

const effective = (s, h) => (s.blocklist.includes(h) ? false : s.allowlist.includes(h) ? true : s.globalEnabled);

async function send(type) {
  if (tabId == null) return null;
  try { return await chrome.tabs.sendMessage(tabId, { type }); } catch { return null; }
}

async function refreshStatus() {
  const st = await send("sbr:status");
  const row = $("status") ? $("status").closest(".status-row") : null;
  if (!host) {
    $("status").textContent = "Not available on this page.";
    if (row) row.dataset.state = "disabled";
  } else if (!st) {
    $("status").textContent = "Reload the page to activate.";
    if (row) row.dataset.state = "notice";
  } else if (!st.enabled) {
    $("status").textContent = "Disabled on this site.";
    if (row) row.dataset.state = "disabled";
  } else if (st.paused) {
    $("status").textContent = "Paused — hidden sidebars restored.";
    if (row) row.dataset.state = "coral";
  } else {
    $("status").textContent = st.hiddenCount ? `${st.hiddenCount} sidebar${st.hiddenCount > 1 ? "s" : ""} hidden.` : "No sidebars detected.";
    if (row) row.dataset.state = st.hiddenCount ? "success" : "idle";
  }
}

function renderList(id, items) {
  const ul = $(id);
  ul.textContent = "";
  for (const h of items) {
    const li = document.createElement("li");
    li.textContent = h;
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "✕";
    b.title = "Remove";
    b.onclick = async () => {
      const s = await getSettings();
      await saveSettings({ [id]: s[id].filter((x) => x !== h) });
      render();
    };
    li.appendChild(b);
    ul.appendChild(li);
  }
}

async function render() {
  const s = await getSettings();
  $("globalToggle").checked = s.globalEnabled;
  $("scrollToggle").checked = s.hideScrollbars;
  $("siteToggle").checked = host ? effective(s, host) : false;
  $("siteToggle").disabled = !host;
  renderList("allowlist", s.allowlist);
  renderList("blocklist", s.blocklist);
  setTimeout(refreshStatus, 250);
}

$("globalToggle").onchange = async (e) => { await saveSettings({ globalEnabled: e.target.checked }); render(); };

$("scrollToggle").onchange = async (e) => { await saveSettings({ hideScrollbars: e.target.checked }); render(); };

$("siteToggle").onchange = async (e) => {
  const s = await getSettings();
  const allow = s.allowlist.filter((x) => x !== host);
  const block = s.blocklist.filter((x) => x !== host);
  // only store an override when it differs from the global default
  if (e.target.checked && !s.globalEnabled) allow.push(host);
  if (!e.target.checked && s.globalEnabled) block.push(host);
  await saveSettings({ allowlist: allow, blocklist: block });
  render();
};

$("restore").onclick = async () => { await send("sbr:restore"); refreshStatus(); };
$("rescan").onclick = async () => { await send("sbr:rescan"); refreshStatus(); };

$("addForm").onsubmit = async (e) => {
  e.preventDefault();
  const h = normalize($("addHost").value);
  if (!h || !/^[a-z0-9.-]+$/.test(h)) return;
  const list = $("addList").value;
  const other = list === "allowlist" ? "blocklist" : "allowlist";
  const s = await getSettings();
  await saveSettings({
    [list]: [...new Set([...s[list], h])],
    [other]: s[other].filter((x) => x !== h),
  });
  $("addHost").value = "";
  render();
};

(async () => {
  if (typeof chrome !== "undefined" && chrome?.tabs?.query) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        tabId = tab.id;
        const u = new URL(tab.url || "");
        if (u.protocol === "http:" || u.protocol === "https:") host = u.hostname.replace(/^www\./, "");
      }
    } catch {}
  } else {
    host = "example.com";
  }
  $("host").textContent = host || "Unsupported page";
  render();
})();
