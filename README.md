<div align="center">

<img src="extension/icons/icon128.png" width="96" height="96" alt="Sidebar Remover Logo" />

# 🚫 Sidebar Remover for All Websites

**Reclaim your screen space. Enjoy clean, distraction-free reading on any website.**

[![Live Landing Page](https://img.shields.io/badge/Live_Demo-GitHub_Pages-F43F87?style=for-the-badge&logo=githubpages&logoColor=white)](https://witrfaruk.github.io/Sidebar-Remover/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-FF705E?style=for-the-badge&logo=googlechrome&logoColor=white)](#)
[![Privacy First](https://img.shields.io/badge/Privacy-100%25_Local-8FB7A0?style=for-the-badge)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-72A4F2?style=for-the-badge)](#)
[![Theme](https://img.shields.io/badge/Theme-Neo_Brutalist-FF2A6D?style=for-the-badge)](#)

<br/>

<a href="https://witrfaruk.github.io/Sidebar-Remover/">
  <img src="assets/banner.svg" width="100%" alt="Sidebar Remover Live Animation" />
</a>

<p><em>▲ Watch sidebars &amp; scrollbars disappear automatically while content expands smoothly.</em></p>

</div>

---

### 🌐 Official Website &amp; Live Demo
👉 **[Visit the Live Website on GitHub Pages](https://witrfaruk.github.io/Sidebar-Remover/)** to try the interactive before/after simulation!

---

### 📂 Repository Structure

```text
├── assets/          # Media, badges, and animated banner SVG
├── extension/       # Chrome Extension source files (Load Unpacked here)
│   ├── fonts/       # Local self-hosted fonts (100% offline & GDPR-compliant)
│   ├── icons/       # High-resolution extension icons
│   └── ...          # manifest.json, background.js, content.js, popup.*
├── page/            # Official GitHub Pages website and interactive simulator
├── LICENSE          # MIT Open Source License
└── README.md        # Project documentation
```

---

### ✨ Features at a Glance

| Feature | Description |
| :--- | :--- |
| ⚡ **Intelligent Auto-Detection** | Smart heuristics automatically detect sticky and fixed nav rails without touching core media or content. |
| 🛡️ **Zero Layout Breakage** | Expands the main reading container to 100% full width smoothly when sidebars are hidden. |
| 🚫 **Scrollbar Killer** | Suppresses vertical &amp; horizontal scrollbars while retaining full wheel, trackpad, and keyboard scrolling. |
| 🔒 **100% Local &amp; Private** | Runs purely in your browser. Zero tracking, zero telemetry, and zero remote network requests. |
| 🎛️ **Per-Site Controls** | Enable or disable per website with a single click in the popup; automatically saves your preference per domain. |
| ☕ **Direct Support & Feedback** | Built-in troubleshooting diagnostics panel, Ko-fi donation link, and feature request form. |
| 🔤 **100% Offline & Private** | Self-hosted local typography with zero external CDN calls, 100% GDPR-compliant. |
| ⚡ **Neo-Brutalist UI** | High-contrast neo-brutalist pop interface with tactile switches and micro-animations. |

---

### 🚀 Quick Installation

#### Method 1: Load in Developer Mode (Instant)
1. **Clone this repository**:
   ```bash
   git clone https://github.com/witrfaruk/Sidebar-Remover.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the `extension` folder.
5. Pin **Sidebar Remover** to your Chrome toolbar!

---

### 🎯 How to Use

1. **Browse Any Website**: Visit your favorite blogs, documentation, news, or forums. Sidebars and scrollbars disappear automatically.
2. **Open the Popup**: Click the **Sidebar Remover** toolbar icon to view controls for the active website.
3. **Hide Scrollbars Switch**: Toggle scrollbar suppression on or off without losing trackpad or mouse wheel scrolling.
4. **Hide Sidebar Switch**: Instantly toggle sidebar removal on or off for the current domain with real-time feedback.
5. **Support & Feedback**: Use the Neo-Brutalist footer buttons to open the built-in Support panel, submit feature requests, or support development on Ko-fi.

---

### ⌨️ Architecture &amp; Tech Stack

- **Manifest V3**: Modern service worker and content script architecture.
- **Engine-Level CSS**: High-precedence scrollbar suppression injected before page render.
- **Dynamic Mutation Monitoring**: Seamlessly supports Single Page Applications (Next.js, React, Vue, Turbo).

---

<div align="center">

Made with ❤️ by [WitrFaruk](https://github.com/witrfaruk) • [Contact Developer](https://witrfaruk.vercel.app/contact?utm_source=sidebar_remover_readme&utm_medium=referral&utm_campaign=creator_credit)

[![Contact Developer](https://img.shields.io/badge/Contact_Developer-Visit-8FB7A0?style=for-the-badge&logo=vercel&logoColor=white)](https://witrfaruk.vercel.app/contact?utm_source=sidebar_remover_readme&utm_medium=referral&utm_campaign=creator_credit)
[![Support on Ko-fi](https://img.shields.io/badge/Support_on_Ko--fi-Donate-72A4F2?style=for-the-badge&logo=kofi&logoColor=white)](https://ko-fi.com/witrfaruk?utm_source=sidebar_remover_readme&utm_medium=referral&utm_campaign=donation)
[![Star on GitHub](https://img.shields.io/badge/Star_on_GitHub-★-F43F87?style=for-the-badge&logo=github&logoColor=white)](https://github.com/witrfaruk/Sidebar-Remover)

</div>
