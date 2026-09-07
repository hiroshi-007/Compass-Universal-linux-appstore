# 🧭 Compass

**Compass is a universal app store for Linux.**

Compass provides one consistent interface for discovering, installing, managing, and removing applications across multiple Linux software sources.

It supports Debian, Ubuntu, Fedora, Arch, openSUSE, Alpine, and other distributions through their available package managers—alongside Flatpak and Snap where installed.

## ✨ What’s new in v2.5.2

- Faster startup and search through local package caching.
- Unified search now includes available library packages.
- Improved installed-package management, including libraries and system packages.
- More reliable uninstall handling for native packages, Flatpak, and Snap.
- Better support for multi-architecture packages and Flatpak user/system installations.
- Detailed install progress, including dependency/package counters.
- Pause, resume, and cancel controls for supported installations.
- New cleanup tools for identifying unused apps and clearing selected caches, old temporary files, and package-manager caches.
- Smoother performance on lower-spec systems through reduced rendering and background work.

## ✨ Features

- 🌍 **Distro-independent** — designed for a wide range of Linux distributions.
- 📦 **Multiple package sources** — supports native package managers, Flatpak, and Snap when available.
- 🔎 **Unified search** — search applications and libraries from one place.
- 🧩 **Source-aware installation** — uses the appropriate available source on your system.
- 💾 **Local caching** — repeated searches and startup are faster.
- 📊 **Installation progress** — view download and install progress, including dependencies.
- ⏯️ **Install controls** — pause, resume, or cancel supported installations.
- 🖥️ **Modern interface** — a clean, app-store-style graphical experience.
- 🏠 **Home page** — discover featured applications and categories.
- 📱 **Installed packages** — view and manage installed apps, libraries, and system packages.
- 🧹 **Cleanup tools** — identify unused applications and clear selected caches safely.
- 🐧 **Linux-focused** — designed around Linux software distribution systems.

> **Note:** Removing libraries or system packages can affect other software. Compass shows package-manager errors when a package is required by dependencies or protected by the system.

## 📦 Supported Sources

Compass brings multiple Linux software ecosystems together:

| Source | Support |
| --- | --- |
| APT | ✅ |
| DNF | ✅ |
| YUM | ✅ |
| Pacman | ✅ |
| Zypper | ✅ |
| APK | ✅ |
| XBPS | ✅ |
| Flatpak | ✅ |
| Snap | ❌ — Planned for a future update |

Available sources depend on your Linux distribution and which package-management tools are installed.

## ✨ What’s new in v2.5.2

- Faster startup and search through local package caching.
- Unified search now includes available library packages.
- Improved installed-package management, including libraries and system packages.
- More reliable uninstall handling for native packages and Flatpak.
- Better support for multi-architecture packages and Flatpak user/system installations.
- Detailed install progress, including dependency/package counters.
- Pause, resume, and cancel controls for supported installations.
- New cleanup tools for identifying unused apps and clearing selected caches, old temporary files, and package-manager caches.
- Smoother performance on lower-spec systems through reduced rendering and background work.
## 🚀 Installation

1. Download the latest Compass archive from the repository’s **Releases** page.
2. Extract the ZIP archive.
3. Open the extracted folder.
4. Run `install.sh`, or double-click `Install.desktop` where your desktop environment supports it.

The installer detects your Linux environment and installs required dependencies where possible.

> **Note:** Administrator permission may be requested when Compass installs, removes, or updates system-managed packages.

## 🖥️ Compatibility

Compass detects common package-management systems automatically. Compatibility may vary by distribution, desktop environment, package configuration, available repositories, and installed dependencies.

For immutable distributions such as Fedora Silverblue, openSUSE Aeon, or similar systems, native package management may have additional limitations.

## 🛠️ Built With

- Electron
- JavaScript
- HTML
- CSS
- Node.js

## 🎯 Project Goal

Linux has an enormous software ecosystem, but discovering and installing applications can still be confusing for new users.

Compass aims to simplify that experience:

> **One store. Multiple sources. Any Linux distro.**

The long-term goal is to make applications easier to discover and manage without requiring users to understand which package manager their distribution uses.

## 🔮 Future Plans

- Better application metadata and icons
- Improved application deduplication
- Provider selection when an app is available from multiple sources
- AppImage support
- Application updates
- Ratings and reviews
- More accurate categorization
- Faster indexing and search
- Improved support for immutable Linux distributions

## 🤝 Contributing

Contributions, bug reports, feature requests, and ideas are welcome.

When reporting an issue, please include:

1. Linux distribution and version
2. Desktop environment
3. Package source involved
4. Steps to reproduce
5. Expected and actual behavior
6. Relevant error messages

## ⚠️ Development Status

Compass is under active development. Some features may be experimental, and compatibility can vary between distributions and package sources.

## 📄 License

See the repository’s `LICENSE` file.

---

**Compass 🧭 — Find your apps, wherever Linux takes you.**
