# 🧭 Compass — Universal Linux App Store

[Compass website](https://compass-website-orpin.vercel.app/)

Compass provides one consistent interface for discovering, installing, managing, and removing applications across multiple Linux software sources.

It supports Debian, Ubuntu, Fedora, Arch, openSUSE, Alpine, and other distributions through their available package managers, alongside Flatpak and Snap where available.

## ✨ What's new in v2.5.3

- **More reliable Snap progress reporting:** Compass captures Snap's terminal-style output so download and installation stages can update the progress display instead of appearing stuck.
- **Safer Snap cancellation:** cancellation now requests an abort through Snap's own transaction system rather than trying to terminate a privileged process directly, avoiding the common `EPERM` failure path.
- **No unsupported Snap pause:** the Pause control is disabled for Snap because stopping the foreground process does not safely pause the underlying `snapd` operation. Other package sources retain controls where supported.
- **Verified installation status:** Compass checks `snap list` before marking a Snap installation as successful. A successful command exit alone no longer produces a false “installed” state if the package is absent.
- **More accurate retry outcomes:** retries report success only when the application is actually detected as installed.

## ✨ Features

- 🌍 **Distro-independent:** designed for a wide range of Linux distributions.
- 📦 **Multiple package sources:** supports native package managers, Flatpak, and Snap when available.
- 🔎 **Unified search:** search applications and libraries from one place.
- 🧩 **Source-aware installation:** uses an appropriate available source on your system.
- 💾 **Local caching:** repeated searches and startup can be faster.
- 📊 **Installation progress:** view available download/install progress and dependency information.
- ⏯️ **Install controls:** pause/resume where supported; cancel support depends on the package source. Snap supports cancellation but cannot be safely paused through process signals.
- 🖥️ **Modern interface:** an app-store-style graphical experience.
- 🏠 **Home page:** discover featured applications and categories.
- 📱 **Installed packages:** view and manage installed applications, libraries, and system packages.
- 🧹 **Cleanup tools:** identify unused applications and clear selected caches, temporary files, and package-manager caches.
- 🐧 **Linux-focused:** designed around Linux software distribution systems.

> **Caution:** Removing libraries or system packages can affect other software. Package managers may refuse to remove packages required by dependencies or protected by the system.

## 📦 Supported sources

Availability depends on your distribution and which package-management tools are installed.

| Source | Support |
|---|---|
| APT | ✅ |
| DNF | ✅ |
| YUM | ✅ |
| Pacman | ✅ |
| Zypper | ✅ |
| APK | ✅ |
| XBPS | ✅ |
| Flatpak | ✅ |
| Snap | ✅ (Snapd required or installable) |

## 🚀 Installation

1. Download the latest Compass archive from the repository's Releases page.
2. Extract the ZIP archive.
3. Open the extracted folder.
4. Run `install.sh`, or double-click `Install.desktop` where your desktop environment supports it.

The installer detects the Linux environment and attempts to install required dependencies where possible. Administrator permission may be requested when Compass installs, removes, or updates system-managed packages.

## 🖥️ Compatibility

Compass detects common package-management systems automatically. Compatibility may vary by distribution and version, desktop environment, package configuration, repositories, and installed dependencies.

Immutable distributions such as Fedora Silverblue, openSUSE Aeon, and similar systems may have additional limitations for native package management.

## 🛠️ Built with

- Electron
- JavaScript
- HTML / CSS
- Node.js
- Shell scripts

## 🎯 Project goal

Linux has an enormous software ecosystem, but discovering and installing applications can still be confusing for new users. Compass aims to simplify that experience:

**One store. Multiple sources. Any Linux distro.**

The long-term goal is to make applications easier to discover and manage without requiring users to understand which package manager their distribution uses.

## 🔮 Future plans

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

Contributions, bug reports, feature requests, and ideas are welcome. When reporting an issue, please include:

- Linux distribution and version
- Desktop environment
- Package source involved
- Steps to reproduce
- Expected and actual behavior
- Relevant error messages

## ⚠️ Development status

Compass is under active development. Some features may be experimental, and compatibility can vary between distributions and package sources.

## 📄 License

See the repository's `LICENSE` file.

**Compass 🧭 — Find your apps, wherever Linux takes you.**
