# 🧭 Compass

**Compass is a universal app store for Linux.**

Instead of using a different software center depending on your Linux distribution, Compass provides a single interface for discovering and installing applications from multiple Linux software sources.

Whether you're using Debian, Ubuntu, Fedora, Arch, openSUSE, Alpine, or another Linux distribution, Compass aims to give you one consistent app-store experience.

## ✨ Features

* 🌍 **Distro-independent** — designed to work across many Linux distributions
* 📦 **Multiple package sources** — supports native system package managers alongside Flatpak and Snap when available
* 🔎 **Unified app search** — search across available software sources from one place
* 🧩 **Source-aware installation** — Compass can use the appropriate package source available on your system
* 💾 **Caching** — package information is cached locally to make repeated searches faster
* 🖥️ **Modern interface** — clean, app-store-style graphical interface
* 🏠 **Home page** — discover applications through categories and featured content
* 📱 **Installed applications** — view software installed through the supported sources
* 🐧 **Linux-focused** — built specifically around the way Linux software is distributed

## 📦 Supported Sources

Compass is designed to bring multiple Linux software ecosystems together, including:

* **Native package managers**

  * APT
  * DNF
  * YUM
  * Pacman
  * Zypper
  * APK
  * XBPS
* **Flatpak**
* **Snap**

The available sources depend on what is installed and supported by your Linux system.

## 🚀 Installation

Compass is designed to be simple to get running.

### 1. Download Compass

Download the latest Compass archive from the **Releases** section of this repository.

### 2. Extract the archive

Extract the downloaded `.tar.gz`/ZIP archive to a location of your choice.

### 3. Launch Compass

Open the extracted folder and run the Compass executable/launcher.

Compass's installer can detect your Linux environment and install the dependencies required by the application.

> **Note:** Some installations may require administrator privileges when installing system dependencies or applications.

## 🖥️ Compatibility

Compass is intended to work across a wide range of Linux distributions.

It currently detects several common package-management systems automatically, including:

| Package system | Support |
| -------------- | ------- |
| APT            | ✅       |
| DNF            | ✅       |
| YUM            | ✅       |
| Pacman         | ✅       |
| Zypper         | ✅       |
| APK            | ✅       |
| XBPS           | ✅       |
| Flatpak        | ✅       |
| Snap           | ✅       |

Compatibility can vary depending on the distribution, desktop environment, installed dependencies, and package configuration.

## 🛠️ Built With

Compass is built using:

* **Electron**
* **JavaScript**
* **HTML**
* **CSS**
* **Node.js**

## 🎯 Project Goal

Linux has an enormous software ecosystem, but discovering and installing applications can still be confusing for new users.

Different distributions use different package managers, while applications may also be distributed through Flatpak, Snap, AppImages, GitHub releases, and other sources.

Compass aims to make this experience simpler:

> **One store. Multiple sources. Any Linux distro.**

The long-term goal is to make applications easier to discover without requiring users to understand which package manager their distribution uses.

## 🔮 Future Plans

Some possible improvements for future versions include:

* Better application metadata
* More software sources
* Improved application deduplication
* Choosing between providers when the same application is available from multiple sources
* Better application icons
* AppImage support
* Improved installed-app detection
* Application updates
* Ratings and reviews
* More accurate application categorization
* Repository/provider selection
* Faster search and indexing
* Improved support for immutable Linux distributions

## 🤝 Contributing

Contributions, bug reports, feature requests, and ideas are welcome.

If you find a problem, please open an **Issue** with:

1. Your Linux distribution
2. Your desktop environment
3. The package source involved
4. What you expected to happen
5. What actually happened
6. Any relevant error messages

Pull requests are also welcome.

## ⚠️ Development Status

Compass is currently under active development.

Some features may still be experimental, and compatibility can vary between distributions and package sources.

Please report bugs and compatibility issues so they can be investigated.

## 📄 License

See the repository's `LICENSE` file for the license used by Compass.

---

**Compass 🧭 — Find your apps, wherever Linux takes you.**
