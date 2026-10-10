/* Sidebar Remover — content script (isolated world). No network access, no data leaves the page. */
(() => {
  if (window.__sidebarRemoverLoaded) return;
  window.__sidebarRemoverLoaded = true;

  const HIDDEN_ATTR = "data-sbr-hidden";
  const STYLE_ID = "sbr-style";
  const THRESHOLD = 5;
  const DEFAULTS = { globalEnabled: false, allowlist: [], blocklist: [], hideScrollbars: true, scrollAllowlist: [], scrollBlocklist: [] };
  const SCROLL_ID = "sbr-scroll-style";
  const host = location.hostname.replace(/^www\./, "");
  const isTop = window === window.top;

  const NAME_RE = /(^|[\s_-])(sidebar|side-bar|sidenav|side-nav|sidepanel|side-panel|side-menu|leftnav|rightnav|left-nav|right-nav|leftcol|rightcol|left-col|right-col|left-rail|right-rail|rail|drawer|offcanvas|off-canvas|aside)([\s_-]|$)/i;
  const PROTECT_RE = /(filter|facet|refine|chat|messag|comment|discussion|player|video|cart|checkout|toc|table-of-contents|editor|compose|modal|dialog|cookie|consent)/i;

  const SCROLL_CSS = `
    html, body, :root, * {
      scrollbar-width: none !important;
      scrollbar-color: transparent transparent !important;
      -ms-overflow-style: none !important;
    }
    ::-webkit-scrollbar,
    ::-webkit-scrollbar-button,
    ::-webkit-scrollbar-track,
    ::-webkit-scrollbar-track-piece,
    ::-webkit-scrollbar-thumb,
    ::-webkit-scrollbar-corner,
    ::-webkit-resizer,
    html::-webkit-scrollbar,
    html::-webkit-scrollbar-button,
    html::-webkit-scrollbar-track,
    html::-webkit-scrollbar-thumb,
    body::-webkit-scrollbar,
    body::-webkit-scrollbar-button,
    body::-webkit-scrollbar-track,
    body::-webkit-scrollbar-thumb,
    *::-webkit-scrollbar,
    *::-webkit-scrollbar-button,
    *::-webkit-scrollbar-track,
    *::-webkit-scrollbar-track-piece,
    *::-webkit-scrollbar-thumb,
    *::-webkit-scrollbar-corner,
    *::-webkit-resizer {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
      min-width: 0 !important;
      min-height: 0 !important;
      max-width: 0 !important;
      max-height: 0 !important;
      background: transparent !important;
      color: transparent !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    .simplebar-track,
    .simplebar-scrollbar,
    .ps__rail-y,
    .ps__rail-x,
    .ps__thumb-y,
    .ps__thumb-x,
    .os-scrollbar,
    .os-scrollbar-track,
    .os-scrollbar-handle,
    .mCSB_scrollTools,
    .mCSB_dragger,
    .nano-pane,
    .nano-slider,
    [class*="scrollbar-track"],
    [class*="scrollbar-thumb"],
    [class*="custom-scrollbar"]::-webkit-scrollbar {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
      width: 0 !important;
      height: 0 !important;
    }
  `;

  let enabled = false;
  let paused = false; // user pressed "restore" for this page session
  const hidden = new Set(); // elements we hid
  let evaluated = new WeakSet();
  const reclaimed = new Map(); // element -> original inline style props
  let observer = null;
  let pending = new Set();
  let scheduled = false;
  let lastUrl = location.href;
  let scrollbarsActive = false;

  // Immediate synchronous scrollbar suppression
  setScrollbars(true);

  // ---------- settings ----------
  function computeEnabled(s) {
    if ((s.blocklist || []).includes(host)) return false;
    if ((s.allowlist || []).includes(host)) return true;
    return !!s.globalEnabled;
  }

  function computeScrollbars(s) {
    const block = s.scrollBlocklist || [];
    const allow = s.scrollAllowlist || [];
    if (block.includes(host)) return false;
    if (allow.includes(host)) return true;
    return s.hideScrollbars !== false;
  }

  async function loadSettings() {
    try {
      const s = await chrome.storage.local.get(DEFAULTS);
      return { ...DEFAULTS, ...s };
    } catch {
      return DEFAULTS;
    }
  }

  // ---------- style ----------
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `[${HIDDEN_ATTR}]{display:none !important;}`;
    const parent = document.head || document.documentElement;
    if (parent) parent.appendChild(st);
  }

  function setScrollbars(on) {
    scrollbarsActive = on;
    const root = document.documentElement;
    if (root) {
      if (on) {
        root.classList.remove("sbr-show-scrollbars");
      } else {
        root.classList.add("sbr-show-scrollbars");
      }
    }
    const ex = document.getElementById(SCROLL_ID);
    if (!on) {
      if (ex) ex.remove();
      return;
    }
    if (ex && ex.textContent === SCROLL_CSS) {
      const target = document.head || document.documentElement;
      if (target && target.lastElementChild !== ex) {
        target.appendChild(ex);
      }
      return;
    }
    const st = ex || document.createElement("style");
    st.id = SCROLL_ID;
    st.textContent = SCROLL_CSS;
    const parent = document.head || document.documentElement;
    if (parent) parent.appendChild(st);
  }

  // ---------- detection ----------
  function nameOf(el) {
    const cls = typeof el.className === "string" ? el.className : el.getAttribute("class") || "";
    return `${el.id || ""} ${cls} ${el.getAttribute("data-testid") || ""}`;
  }

  function labelOf(el) {
    return `${el.getAttribute("aria-label") || ""} ${el.getAttribute("aria-labelledby") || ""}`;
  }

  function isProtected(el, rect) {
    if (el === document.body || el === document.documentElement) return true;
    const tag = el.tagName;
    if (tag === "MAIN" || tag === "ARTICLE" || tag === "VIDEO" || tag === "IFRAME" || tag === "FORM") return true;
    const role = el.getAttribute("role");
    if (role === "main" || role === "dialog" || role === "alertdialog" || role === "log" || role === "feed") return true;
    if (el.getAttribute("aria-modal") === "true") return true;
    if (PROTECT_RE.test(nameOf(el)) || PROTECT_RE.test(labelOf(el))) return true;

    // contains essential content
    if (el.querySelector("main, [role=main], article, video, [contenteditable=''], [contenteditable=true], textarea, [role=log], [role=feed]")) return true;

    // If it has an h1, only protect if it is NOT a navigation element and lacks navigation links
    if (el.querySelector("h1")) {
      const isNav = tag === "NAV" || tag === "ASIDE" || role === "navigation" || role === "complementary" || NAME_RE.test(nameOf(el));
      const linkCount = el.querySelectorAll("a[href]").length;
      if (!isNav || linkCount < 3) return true;
    }

    // looks like main content: lots of prose, media, or headings
    const text = (el.innerText || "").length;
    if (text > 3500) return true;
    if (el.querySelectorAll("p").length >= 6) return true;
    if (el.querySelectorAll("h2, h3").length >= 5) return true;

    // product filters: many checkboxes / range inputs
    if (el.querySelectorAll("input[type=checkbox], input[type=radio], input[type=range]").length >= 4) return true;

    // embedded players / chat widgets
    if (el.querySelector("iframe[src*='youtube'], iframe[src*='vimeo'], iframe[src*='player'], iframe[title*='chat' i]")) return true;

    // the element is basically the whole page
    if (rect.width > window.innerWidth * 0.48) return true;
    return false;
  }

  function scoreElement(el) {
    if (!(el instanceof HTMLElement) || evaluated.has(el) || el.hasAttribute(HIDDEN_ATTR)) return -1;
    evaluated.add(el);

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.width < 80 || rect.height < 100) return -1;
    if (vw < 680) return -1; // mobile layouts: sidebars are usually already collapsed

    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return -1;

    // geometry gates
    const widthOk = rect.width >= 100 && rect.width <= Math.min(520, vw * 0.38);
    const visibleHeight = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
    const tall = rect.height >= vh * 0.45 || visibleHeight >= vh * 0.55;
    const onLeft = rect.left <= vw * 0.25;
    const onRight = rect.right >= vw * 0.75;
    if (!widthOk || !tall || !(onLeft || onRight)) return -1;
    if (rect.right <= 0 || rect.left >= vw) return -1; // off-screen drawer already collapsed

    if (isProtected(el, rect)) return -1;

    // hard gate: only hide elements that are clearly labelled as a sidebar/navigation.
    const tag0 = el.tagName;
    const role0 = el.getAttribute("role");
    const named = NAME_RE.test(nameOf(el));
    const semantic = tag0 === "ASIDE" || role0 === "complementary" || tag0 === "NAV" || role0 === "navigation";
    if (!named && !semantic) return -1;

    let score = 0;
    const tag = el.tagName;
    const role = el.getAttribute("role");
    if (tag === "ASIDE") score += 3;
    if (role === "complementary") score += 3;
    if (tag === "NAV" || role === "navigation") score += 2;
    if (NAME_RE.test(nameOf(el))) score += 2;
    if (/sidebar|navigation|menu/i.test(labelOf(el))) score += 1;
    if (cs.position === "fixed" || cs.position === "sticky") score += 2;
    if (rect.height >= vh * 0.8) score += 1;
    if (onLeft && rect.left <= 12) score += 1;
    if (onRight && rect.right >= vw - 12) score += 1;

    // layout column: parent has a sibling much wider than this element
    const parent = el.parentElement;
    if (parent) {
      for (const sib of parent.children) {
        if (sib === el || !(sib instanceof HTMLElement)) continue;
        const r = sib.getBoundingClientRect();
        if (r.width >= rect.width * 1.5 && r.height >= vh * 0.35) {
          const horizontallySeparate = r.left >= rect.right - 8 || r.right <= rect.left + 8;
          if (horizontallySeparate) { score += 2; break; }
        }
      }
    }

    // link density (navigation-like)
    const links = el.querySelectorAll("a[href]").length;
    const textLen = (el.innerText || "").length || 1;
    if (links >= 4) score += 1;
    if (links >= 4 && links / (textLen / 40) > 0.5) score += 1;

    // penalties
    if (el.querySelectorAll("img").length > 8 && links < 4) score -= 2; // gallery/content
    if (textLen > 4500) score -= 2; // long prose, likely content
    if (el.querySelector("input[type=search], input[type=text]") && links < 4) score -= 2;

    return score;
  }

  function candidatesIn(root) {
    const out = new Set();
    const sel = "aside, nav, [role=complementary], [role=navigation], [id*=side i], [class*=side i], [class*=drawer i], [class*=rail i], [class*=nav i], [class*=menu i]";
    if (root instanceof HTMLElement && root.matches(sel)) out.add(root);
    if (root.querySelectorAll) root.querySelectorAll(sel).forEach((e) => out.add(e));
    return out;
  }

  // outermost-wins: skip candidates nested in an already chosen one
  function pickHighConfidence(cands) {
    const scored = [];
    for (const el of cands) {
      const s = scoreElement(el);
      if (s >= THRESHOLD) scored.push({ el, s });
    }
    scored.sort((a, b) => b.s - a.s);
    const chosen = [];
    for (const { el } of scored) {
      if (chosen.some((c) => c.contains(el) || el.contains(c))) continue;
      if ([...hidden].some((h) => h.contains(el))) continue;
      chosen.push(el);
    }
    return chosen;
  }

  // ---------- hide / reclaim ----------
  function saveInline(el, props) {
    if (!reclaimed.has(el)) {
      const orig = {};
      props.forEach((p) => { orig[p] = [el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]; });
      reclaimed.set(el, orig);
    }
  }

  function reclaimSpace(sidebar, rect, wasFixed) {
    const w = rect.width;
    const onLeft = rect.left < window.innerWidth / 2;
    const side = onLeft ? "left" : "right";

    // fixed/sticky sidebars: content is offset with margin/padding roughly equal to the sidebar width
    if (wasFixed && document.body) {
      const targets = [document.body, ...document.body.children, ...document.querySelectorAll("main, [role=main]")];
      for (const t of targets) {
        if (!(t instanceof HTMLElement) || t === sidebar || t.hasAttribute(HIDDEN_ATTR)) continue;
        const cs = getComputedStyle(t);
        for (const kind of ["margin", "padding"]) {
          const prop = `${kind}-${side}`;
          const v = parseFloat(cs[`${kind}${onLeft ? "Left" : "Right"}`]);
          if (v > 0 && Math.abs(v - w) <= Math.max(30, w * 0.18)) {
            saveInline(t, [prop]);
            t.style.setProperty(prop, "0px", "important");
          }
        }
      }
    }

    // grid parents: collapse the now-empty track
    const parent = sidebar.parentElement;
    if (parent) {
      const pcs = getComputedStyle(parent);
      if (pcs.display.includes("grid")) {
        const visible = [...parent.children].filter((c) => c instanceof HTMLElement && !c.hasAttribute(HIDDEN_ATTR) && getComputedStyle(c).display !== "none");
        const tracks = pcs.gridTemplateColumns.split(" ").filter(Boolean);
        if (visible.length >= 1 && tracks.length > visible.length) {
          saveInline(parent, ["grid-template-columns", "grid-template-areas"]);
          parent.style.setProperty("grid-template-columns", visible.length === 1 ? "minmax(0, 1fr)" : `repeat(${visible.length}, minmax(0, 1fr))`, "important");
          parent.style.setProperty("grid-template-areas", "none", "important");
          visible.forEach((c) => {
            saveInline(c, ["grid-column", "max-width"]);
            if (visible.length === 1) c.style.setProperty("grid-column", "1 / -1", "important");
          });
        }
      }
    }
  }

  function hide(el) {
    const rect = el.getBoundingClientRect();
    const pos = getComputedStyle(el).position;
    el.setAttribute(HIDDEN_ATTR, "1");
    hidden.add(el);
    reclaimSpace(el, rect, pos === "fixed" || pos === "sticky");
  }

  function restoreAll() {
    hidden.forEach((el) => el.removeAttribute(HIDDEN_ATTR));
    hidden.clear();
    reclaimed.forEach((orig, el) => {
      for (const [p, [v, pr]] of Object.entries(orig)) {
        if (v) el.style.setProperty(p, v, pr); else el.style.removeProperty(p);
      }
    });
    reclaimed.clear();
  }

  // ---------- scanning ----------
  function scan(roots) {
    if (!enabled || paused || !document.body) return;
    try {
      const cands = new Set();
      roots.forEach((r) => { if (r && r.isConnected) candidatesIn(r).forEach((c) => cands.add(c)); });
      const chosen = pickHighConfidence(cands);
      if (chosen.length) {
        observer && observer.disconnect(); // our own changes must not retrigger the observer
        chosen.forEach(hide);
        observe();
      }
    } catch (e) {
      console.debug("[Sidebar Remover] scan failed:", e);
    }
  }

  function schedule(node) {
    pending.add(node);
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      const roots = [...pending];
      pending = new Set();
      scan(roots);
    };
    "requestIdleCallback" in window ? requestIdleCallback(run, { timeout: 800 }) : setTimeout(run, 300);
  }

  function observe() {
    if (!observer) {
      observer = new MutationObserver((muts) => {
        let any = false;
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && n.id !== STYLE_ID && n.id !== SCROLL_ID) { schedule(n); any = true; }
          }
        }
        if (any && pending.size > 200 && document.body) { pending = new Set([document.body]); }

        // Re-affirm scrollbar hiding if website re-rendered head or removed styles
        if (scrollbarsActive) {
          const ex = document.getElementById(SCROLL_ID);
          if (!ex) setScrollbars(true);
        }
      });
    }
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  function fullRescan() {
    pending = new Set();
    if (document.body) scan([document.body]);
  }

  function onUrlChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    setTimeout(() => {
      resetEvaluated();
      fullRescan();
      if (scrollbarsActive) setScrollbars(true);
    }, 400);
  }

  function resetEvaluated() {
    evaluated = new WeakSet();
  }

  // ---------- lifecycle ----------
  async function apply() {
    const s = await loadSettings();
    const next = computeEnabled(s);
    setScrollbars(computeScrollbars(s));
    if (next === enabled) return;
    enabled = next;
    if (enabled) {
      paused = false;
      ensureStyle();
      resetEvaluated();
      fullRescan();
      observe();
    } else {
      observer && observer.disconnect();
      restoreAll();
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") apply();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "sbr:status") {
      reply({ enabled, paused, hiddenCount: hidden.size, host });
    } else if (msg.type === "sbr:restore") {
      paused = true;
      observer && observer.disconnect();
      restoreAll();
      reply({ ok: true, hiddenCount: 0 });
    } else if (msg.type === "sbr:rescan") {
      paused = false;
      if (enabled) { ensureStyle(); resetEvaluated(); fullRescan(); observe(); }
      reply({ ok: true, hiddenCount: hidden.size });
    }
  });

  window.addEventListener("popstate", onUrlChange);
  window.addEventListener("hashchange", onUrlChange);
  setInterval(onUrlChange, 1000);

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      apply();
    }, { once: true });
  } else {
    apply();
  }
})();
