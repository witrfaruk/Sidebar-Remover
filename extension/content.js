/* Sidebar Remover — content script (isolated world). High-performance, zero layout-thrashing. */
(() => {
  if (window.__sidebarRemoverLoaded) return;
  window.__sidebarRemoverLoaded = true;

  // Sidebar removal operates on the top-level window context.
  if (window !== window.top) return;

  const HIDDEN_ATTR = "data-sbr-hidden";
  const STYLE_ID = "sbr-style";
  const THRESHOLD = 3;
  const DEFAULTS = {
    globalEnabled: false,
    sitePreferences: {},
    allowlist: [],
    blocklist: [],
    hideScrollbars: true,
    scrollAllowlist: [],
    scrollBlocklist: []
  };
  const host = location.hostname ? location.hostname.replace(/^www\./, "") : (location.protocol === "file:" ? "Local File" : "");

  const NAME_RE = /sidebar|side-bar|sidenav|side-nav|sidepanel|side-panel|side-menu|leftnav|rightnav|left-nav|right-nav|leftcol|rightcol|left-rail|right-rail|\brail\b|drawer|offcanvas|aside/i;

  let enabled = false;
  let paused = false;
  const hidden = new Set();
  let evaluated = new WeakSet();
  const reclaimed = new Map();
  let observer = null;
  let pending = new Set();
  let scheduled = false;
  let lastUrl = location.href;
  let scrollbarsActive = true;

  // ---------- scrollbar control ----------
  function setScrollbars(on) {
    scrollbarsActive = on;
    const root = document.documentElement;
    if (!root) return;
    if (on) {
      root.classList.remove("sbr-show-scrollbars");
    } else {
      root.classList.add("sbr-show-scrollbars");
    }
  }

  // Synchronous initial scrollbar suppression
  setScrollbars(true);

  // ---------- settings ----------
  function computeEnabled(s) {
    if (host && s.sitePreferences && s.sitePreferences[host] && s.sitePreferences[host].sidebar !== undefined) {
      return !!s.sitePreferences[host].sidebar;
    }
    if ((s.blocklist || []).includes(host)) return false;
    if ((s.allowlist || []).includes(host)) return true;
    return !!s.globalEnabled;
  }

  function computeScrollbars(s) {
    if (host && s.sitePreferences && s.sitePreferences[host] && s.sitePreferences[host].scrollbars !== undefined) {
      return !!s.sitePreferences[host].scrollbars;
    }
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

  // ---------- style injection ----------
  function ensureStyle() {
    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement("style");
      st.id = STYLE_ID;
      const parent = document.head || document.documentElement;
      if (parent) parent.appendChild(st);
    }
    st.textContent = `
      [${HIDDEN_ATTR}] {
        display: none !important;
        width: 0 !important;
        max-width: 0 !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      html:not(.sbr-show-scrollbars),
      html:not(.sbr-show-scrollbars) body,
      html:not(.sbr-show-scrollbars) :root,
      html:not(.sbr-show-scrollbars) *,
      html:not(.sbr-show-scrollbars) *::before,
      html:not(.sbr-show-scrollbars) *::after {
        scrollbar-width: none !important;
        scrollbar-color: transparent transparent !important;
        -ms-overflow-style: none !important;
      }
      /* Prevent horizontal scrollbars on top or bottom of viewport */
      html:not(.sbr-show-scrollbars),
      html:not(.sbr-show-scrollbars) body {
        overflow-x: clip !important;
      }
      /* WebKit & Blink Scrollbars (both vertical & horizontal) */
      html:not(.sbr-show-scrollbars) ::-webkit-scrollbar,
      html:not(.sbr-show-scrollbars) *::-webkit-scrollbar,
      html:not(.sbr-show-scrollbars) ::-webkit-scrollbar:horizontal,
      html:not(.sbr-show-scrollbars) *::-webkit-scrollbar:horizontal,
      html:not(.sbr-show-scrollbars) ::-webkit-scrollbar-thumb,
      html:not(.sbr-show-scrollbars) *::-webkit-scrollbar-thumb,
      html:not(.sbr-show-scrollbars) ::-webkit-scrollbar-thumb:horizontal,
      html:not(.sbr-show-scrollbars) *::-webkit-scrollbar-thumb:horizontal,
      html:not(.sbr-show-scrollbars) ::-webkit-scrollbar-track,
      html:not(.sbr-show-scrollbars) *::-webkit-scrollbar-track,
      html:not(.sbr-show-scrollbars) ::-webkit-scrollbar-track:horizontal,
      html:not(.sbr-show-scrollbars) *::-webkit-scrollbar-track:horizontal,
      html:not(.sbr-show-scrollbars) ::-webkit-scrollbar-track-piece,
      html:not(.sbr-show-scrollbars) *::-webkit-scrollbar-track-piece,
      html:not(.sbr-show-scrollbars) ::-webkit-scrollbar-track-piece:horizontal,
      html:not(.sbr-show-scrollbars) *::-webkit-scrollbar-track-piece:horizontal,
      html:not(.sbr-show-scrollbars) ::-webkit-scrollbar-button,
      html:not(.sbr-show-scrollbars) *::-webkit-scrollbar-button,
      html:not(.sbr-show-scrollbars) ::-webkit-scrollbar-button:horizontal,
      html:not(.sbr-show-scrollbars) *::-webkit-scrollbar-button:horizontal,
      html:not(.sbr-show-scrollbars) ::-webkit-scrollbar-corner,
      html:not(.sbr-show-scrollbars) *::-webkit-scrollbar-corner,
      html:not(.sbr-show-scrollbars) ::-webkit-scrollbar-corner:horizontal,
      html:not(.sbr-show-scrollbars) *::-webkit-scrollbar-corner:horizontal {
        display: none !important;
        width: 0px !important;
        height: 0px !important;
        min-width: 0px !important;
        min-height: 0px !important;
        max-width: 0px !important;
        max-height: 0px !important;
        line-height: 0px !important;
        background: transparent !important;
        background-color: transparent !important;
        color: transparent !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
        border: none !important;
        box-shadow: none !important;
      }
      /* Custom JS horizontal & vertical scrollbar plugins and third-party progress bars */
      html:not(.sbr-show-scrollbars) .simplebar-track,
      html:not(.sbr-show-scrollbars) .simplebar-scrollbar,
      html:not(.sbr-show-scrollbars) .simplebar-horizontal,
      html:not(.sbr-show-scrollbars) .simplebar-track.simplebar-horizontal,
      html:not(.sbr-show-scrollbars) .ps__rail-y,
      html:not(.sbr-show-scrollbars) .ps__rail-x,
      html:not(.sbr-show-scrollbars) .ps__thumb-y,
      html:not(.sbr-show-scrollbars) .ps__thumb-x,
      html:not(.sbr-show-scrollbars) .os-scrollbar,
      html:not(.sbr-show-scrollbars) .os-scrollbar-track,
      html:not(.sbr-show-scrollbars) .os-scrollbar-handle,
      html:not(.sbr-show-scrollbars) .os-scrollbar-horizontal,
      html:not(.sbr-show-scrollbars) .mCSB_scrollTools,
      html:not(.sbr-show-scrollbars) .mCSB_dragger,
      html:not(.sbr-show-scrollbars) .mCSB_scrollTools_horizontal,
      html:not(.sbr-show-scrollbars) .nano-pane,
      html:not(.sbr-show-scrollbars) .nano-slider,
      html:not(.sbr-show-scrollbars) [class*="scrollbar-track"],
      html:not(.sbr-show-scrollbars) [class*="scrollbar-thumb"],
      html:not(.sbr-show-scrollbars) [class*="scrollbar-horizontal"],
      html:not(.sbr-show-scrollbars) [class*="horizontal-scrollbar"],
      html:not(.sbr-show-scrollbars) [class*="scroll-horizontal"],
      html:not(.sbr-show-scrollbars) [class*="horizontal-scroll"],
      html:not(.sbr-show-scrollbars) [class*="custom-scrollbar"]::-webkit-scrollbar,
      html:not(.sbr-show-scrollbars) body > [class*="scroll-progress"]:not([id^="sbr-"]),
      html:not(.sbr-show-scrollbars) body > [class*="reading-progress"]:not([id^="sbr-"]),
      html:not(.sbr-show-scrollbars) body > [id*="scroll-progress"]:not([id^="sbr-"]),
      html:not(.sbr-show-scrollbars) body > [id*="reading-progress"]:not([id^="sbr-"]),
      html:not(.sbr-show-scrollbars) #nprogress,
      html:not(.sbr-show-scrollbars) .pace-progress {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
        width: 0 !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
      }
    `;
  }

  ensureStyle();

  // ---------- detection heuristics ----------
  function nameOf(el) {
    const cls = typeof el.className === "string" ? el.className : el.getAttribute("class") || "";
    return `${el.id || ""} ${cls} ${el.getAttribute("data-testid") || ""}`;
  }

  function labelOf(el) {
    return `${el.getAttribute("aria-label") || ""} ${el.getAttribute("aria-labelledby") || ""}`;
  }

  function isProtected(el, rect) {
    if (el === document.body || el === document.documentElement) return true;
    if (el.id && el.id.startsWith("sbr-")) return true;
    const tag = el.tagName;
    if (tag === "MAIN" || tag === "BODY" || tag === "HTML") return true;
    const role = el.getAttribute("role");
    if (role === "main" || role === "dialog" || role === "alertdialog") return true;
    if (el.getAttribute("aria-modal") === "true") return true;

    // Never hide the main content container
    if (el.querySelector("main, [role=main]")) return true;

    // Element occupies majority of page width (it is the main reading area)
    const vw = window.innerWidth;
    if (rect.width > vw * 0.55) return true;

    // Never hide center content that is not on the left or right edges
    const isAtEdge = rect.left <= vw * 0.35 || rect.right >= vw * 0.65;
    if (!isAtEdge) return true;

    return false;
  }

  function scoreElement(el) {
    if (!(el instanceof HTMLElement) || evaluated.has(el) || el.hasAttribute(HIDDEN_ATTR)) return -1;
    if (el.id && el.id.startsWith("sbr-")) return -1;
    evaluated.add(el);

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.width < 35 || rect.height < 60) return -1;
    if (vw < 640) return -1;

    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return -1;

    // Geometry: narrow icon rails up to wide documentation sidebars
    const widthOk = rect.width >= 35 && rect.width <= Math.min(680, vw * 0.48);
    const visibleHeight = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
    const tall = rect.height >= vh * 0.30 || visibleHeight >= vh * 0.35;
    const onLeft = rect.left <= vw * 0.35;
    const onRight = rect.right >= vw * 0.65;
    if (!widthOk || !tall || !(onLeft || onRight)) return -1;
    if (rect.right <= 0 || rect.left >= vw) return -1;

    if (isProtected(el, rect)) return -1;

    const tag0 = el.tagName;
    const role0 = el.getAttribute("role");
    const named = NAME_RE.test(nameOf(el));
    const semantic = tag0 === "ASIDE" || role0 === "complementary" || tag0 === "NAV" || role0 === "navigation";
    if (!named && !semantic) return -1;

    let score = 0;
    if (tag0 === "ASIDE") score += 3;
    if (role0 === "complementary") score += 3;
    if (tag0 === "NAV" || role0 === "navigation") score += 2;
    if (named) score += 3;
    if (/sidebar|navigation|menu|rail/i.test(labelOf(el))) score += 2;
    if (cs.position === "fixed" || cs.position === "sticky") score += 2;
    if (rect.height >= vh * 0.65) score += 1;
    if (onLeft && rect.left <= 25) score += 1;
    if (onRight && rect.right >= vw - 25) score += 1;

    // Sibling layout check
    const parent = el.parentElement;
    if (parent) {
      for (const sib of parent.children) {
        if (sib === el || !(sib instanceof HTMLElement)) continue;
        const r = sib.getBoundingClientRect();
        if (r.width >= rect.width * 1.3 && r.height >= vh * 0.3) {
          const horizontallySeparate = r.left >= rect.right - 10 || r.right <= rect.left + 10;
          if (horizontallySeparate) { score += 2; break; }
        }
      }
    }

    return score;
  }

  function candidatesIn(root) {
    const out = new Set();
    const sel = "aside, nav, [role=complementary], [role=navigation], [id*='side' i], [class*='side' i], [class*='drawer' i], [class*='rail' i], [class*='nav' i], [class*='menu' i]";
    if (root instanceof HTMLElement && root.matches(sel)) out.add(root);
    if (root.querySelectorAll) root.querySelectorAll(sel).forEach((e) => out.add(e));
    return out;
  }

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

  // ---------- hide / space reclamation ----------
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

    if (document.body) {
      const targets = [document.body, ...document.body.children, ...document.querySelectorAll("main, [role=main], #main, .main, #content, .content")];
      for (const t of targets) {
        if (!(t instanceof HTMLElement) || t === sidebar || t.hasAttribute(HIDDEN_ATTR)) continue;
        const cs = getComputedStyle(t);
        for (const kind of ["margin", "padding"]) {
          const prop = `${kind}-${side}`;
          const v = parseFloat(cs[`${kind}${onLeft ? "Left" : "Right"}`]);
          if (v > 0 && Math.abs(v - w) <= Math.max(35, w * 0.25)) {
            saveInline(t, [prop]);
            t.style.setProperty(prop, "0px", "important");
          }
        }
      }
    }

    const parent = sidebar.parentElement;
    if (parent) {
      const pcs = getComputedStyle(parent);
      if (pcs.display.includes("grid")) {
        const visible = [...parent.children].filter((c) => c instanceof HTMLElement && !c.hasAttribute(HIDDEN_ATTR) && getComputedStyle(c).display !== "none");
        saveInline(parent, ["grid-template-columns", "grid-template-areas"]);
        parent.style.setProperty("grid-template-columns", visible.length <= 1 ? "1fr" : `repeat(${visible.length}, 1fr)`, "important");
        parent.style.setProperty("grid-template-areas", "none", "important");
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
    // 1. Remove hidden attribute and inline display from all elements in DOM
    document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
      el.removeAttribute(HIDDEN_ATTR);
      el.style.removeProperty("display");
    });
    hidden.clear();

    // 2. Restore all margins/paddings
    reclaimed.forEach((orig, el) => {
      for (const [p, [v, pr]] of Object.entries(orig)) {
        if (v) el.style.setProperty(p, v, pr); else el.style.removeProperty(p);
      }
    });
    reclaimed.clear();
  }

  // ---------- scanning & observation ----------
  function scan(roots) {
    if (!enabled || paused || !document.body) return;
    try {
      const cands = new Set();
      roots.forEach((r) => { if (r && r.isConnected) candidatesIn(r).forEach((c) => cands.add(c)); });
      const chosen = pickHighConfidence(cands);
      if (chosen.length) {
        observer && observer.disconnect();
        chosen.forEach(hide);
        observe();
      }
    } catch (e) {
      console.debug("[Sidebar Remover] scan error:", e);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      const roots = [...pending];
      pending.clear();
      scan(roots);
    };
    if ("requestIdleCallback" in window) {
      requestIdleCallback(run, { timeout: 350 });
    } else {
      requestAnimationFrame(run);
    }
  }

  function observe() {
    if (!enabled || paused) return;
    if (!observer) {
      observer = new MutationObserver((muts) => {
        let any = false;
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && n.id !== STYLE_ID && !n.hasAttribute(HIDDEN_ATTR)) {
              pending.add(n);
              any = true;
            }
          }
        }
        if (any) {
          if (pending.size > 150 && document.body) {
            pending = new Set([document.body]);
          }
          schedule();
        }
      });
    }
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function fullRescan() {
    pending.clear();
    if (document.body) scan([document.body]);
  }

  function resetEvaluated() {
    evaluated = new WeakSet();
  }

  // ---------- lifecycle & message routing ----------
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
      paused = true;
      observer && observer.disconnect();
      restoreAll();
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") apply();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "sbr:quick_toggle") {
      if (msg.target === "scrollbars") {
        setScrollbars(!!msg.value);
      } else if (msg.target === "sidebar") {
        enabled = !!msg.value;
        if (enabled) {
          paused = false;
          ensureStyle();
          resetEvaluated();
          fullRescan();
          observe();
        } else {
          paused = true;
          observer && observer.disconnect();
          restoreAll();
        }
      }
      reply && reply({ ok: true });
      return true;
    } else if (msg.type === "sbr:sync_settings") {
      apply();
      reply && reply({ ok: true });
      return true;
    } else if (msg.type === "sbr:status") {
      reply({ enabled, paused, hiddenCount: hidden.size, host });
      return true;
    } else if (msg.type === "sbr:restore") {
      paused = true;
      observer && observer.disconnect();
      restoreAll();
      reply({ ok: true, hiddenCount: 0 });
      return true;
    } else if (msg.type === "sbr:rescan") {
      paused = false;
      if (enabled) {
        ensureStyle();
        resetEvaluated();
        fullRescan();
        observe();
      }
      reply && reply({ ok: true, hiddenCount: hidden.size });
      return true;
    }
  });

  const handleNav = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    requestAnimationFrame(() => {
      resetEvaluated();
      fullRescan();
    });
  };

  window.addEventListener("popstate", handleNav, { passive: true });
  window.addEventListener("hashchange", handleNav, { passive: true });

  try {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    if (origPush) {
      history.pushState = function(...args) {
        const res = origPush.apply(this, args);
        handleNav();
        return res;
      };
    }
    if (origReplace) {
      history.replaceState = function(...args) {
        const res = origReplace.apply(this, args);
        handleNav();
        return res;
      };
    }
  } catch {}

  // Run initial scan
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      apply();
    }, { once: true });
  } else {
    apply();
  }
})();
