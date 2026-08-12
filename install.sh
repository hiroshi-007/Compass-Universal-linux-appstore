#!/usr/bin/env bash
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
WARNED=0
warn() { echo "  ⚠️  $1"; WARNED=1; }
fail() { echo "  ❌ $1"; exit 1; }

PAUSE_ON_EXIT=1
pause_and_report() {
    local code=$?
    if [ "$PAUSE_ON_EXIT" = "1" ] && [ $code -ne 0 ]; then
        echo ""
        echo "  ❌ Installer exited early (exit code $code) — see the messages above for why."
    fi
    if [ -t 0 ]; then
        echo ""
        read -r -p "  Press Enter to close this window..." _ || true
    fi
}
trap pause_and_report EXIT

clear
echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║       🧭 Compass Installer           ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

DISTRO_ID=""
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO_ID="${ID:-}"
fi

IS_NIXOS=0
[ "$DISTRO_ID" = "nixos" ] && IS_NIXOS=1
[ -f /etc/NIXOS ] && IS_NIXOS=1

IS_ATOMIC=0
command -v rpm-ostree &>/dev/null && IS_ATOMIC=1

PM=""
if command -v apt-get &>/dev/null; then PM="apt"
elif [ "$IS_ATOMIC" = "1" ]; then PM="rpm-ostree"
elif command -v dnf &>/dev/null; then PM="dnf"
elif command -v yum &>/dev/null; then PM="yum"
elif command -v pacman &>/dev/null; then PM="pacman"
elif command -v zypper &>/dev/null; then PM="zypper"
elif command -v apk &>/dev/null; then PM="apk"
elif command -v xbps-install &>/dev/null; then PM="xbps"
fi

SUDO=""
if [ "$(id -u)" = "0" ]; then
    SUDO=""
elif command -v sudo &>/dev/null; then
    SUDO="sudo"
elif command -v doas &>/dev/null; then
    SUDO="doas"
else
    fail "This installer needs root for system packages, but neither 'sudo' nor 'doas' is installed, and you're not root."
fi

echo "  Distro:           ${PRETTY_NAME:-$DISTRO_ID}"
echo "  Package manager:  ${PM:-none found}"
echo "  Privilege tool:   ${SUDO:-running as root}"
[ "$IS_NIXOS" = "1" ] && echo "  NixOS detected – native package installs will be skipped."

echo ""
echo "  Step 1: Checking system compatibility..."
if command -v ldd &>/dev/null; then
    GLIBC_VER=$(ldd --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+$' || echo "")
    if [ -n "$GLIBC_VER" ]; then
        GLIBC_MAJOR=${GLIBC_VER%%.*}
        GLIBC_MINOR=${GLIBC_VER##*.}
        if [ "$GLIBC_MAJOR" -lt 2 ] || { [ "$GLIBC_MAJOR" -eq 2 ] && [ "$GLIBC_MINOR" -lt 28 ]; }; then
            warn "glibc $GLIBC_VER detected – Electron 28 needs glibc 2.28+. The app may fail to launch."
        else
            echo "  ✅ glibc $GLIBC_VER"
        fi
    fi
fi

# ARM / Architecture Detection
ARCH=$(uname -m)
if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
    echo "  ✅ Detected ARM64 architecture. Setting npm to use arm64 Electron."
    export npm_config_arch=arm64
elif [[ "$ARCH" == "armv7l" || "$ARCH" == "armhf" ]]; then
    echo "  ✅ Detected ARMv7 architecture. Setting npm to use armv7l Electron."
    export npm_config_arch=armv7l
else
    echo "  ✅ Detected x86_64 architecture."
fi

echo ""
echo "  Step 2: Installing Node.js + npm..."
export NVM_DIR="$HOME/.nvm"
NEED_NODE=1
if command -v node &>/dev/null; then
    NODE_MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null; then
        NEED_NODE=0
        echo "  ✅ Node.js $(node -v) already installed"
    fi
fi
if [ "$NEED_NODE" = "1" ]; then
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
        echo "  Installing nvm..."
        if command -v curl &>/dev/null; then
            curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        else
            wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        fi
    fi
    set +u
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    if command -v nvm &>/dev/null; then
        nvm install --lts && nvm use --lts
    else
        set -u
        fail "nvm installation failed."
    fi
    set -u
fi
if command -v node &>/dev/null; then
    echo "  ✅ Node.js $(node --version), npm $(npm --version 2>/dev/null)"
else
    fail "Node.js installation failed."
fi

# NIXOS SPECIAL TWEAK
if [ "$IS_NIXOS" = "1" ]; then
    echo ""
    echo "  Step 3 (NixOS): Generating shell.nix to provide required dependencies..."
    cat > "$DIR/shell.nix" <<'NIXSHELL'
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_20
    electron
    atk
    at-spi2-atk
    at-spi2-core
    cairo
    gtk3
    mesa
    pango
    alsa-lib
    nss
    nspr
  ];
  shellHook = ''
    echo "NixOS environment is ready. Run './install.sh' from this shell to install the app."
  '';
}
NIXSHELL
    echo "  ✅ shell.nix generated! To run this app on NixOS:"
    echo "     1. Run: nix-shell"
    echo "     2. Inside the shell, run: ./install.sh"
    echo ""
    echo "  Skipping native Electron library installation (handled by nix-shell)."
    echo "  Proceeding to install the app core..."
else
    echo ""
    echo "  Step 3: Installing Electron runtime libraries..."
    install_electron_deps() {
        local rc=0
        case "$PM" in
            apt)
                $SUDO apt-get update -qq
                $SUDO apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 \
                    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libxkbcommon0 \
                    libgbm1 libasound2 libpango-1.0-0 libcairo2 libgtk-3-0 libdrm2 libnspr4 2>&1 | tail -8
                rc=${PIPESTATUS[0]}
                ;;
            dnf|yum)
                $SUDO "$PM" install -y nss atk at-spi2-atk at-spi2-core \
                    libX11-xcb libXcomposite libXdamage libXrandr libxkbcommon \
                    mesa-libgbm alsa-lib pango cairo gtk3 libdrm nspr 2>&1 | tail -8
                rc=${PIPESTATUS[0]}
                ;;
            pacman)
                $SUDO pacman -Sy --noconfirm --needed nss atk at-spi2-atk at-spi2-core \
                    libxcomposite libxdamage libxrandr libxkbcommon mesa alsa-lib pango cairo gtk3 libdrm nspr 2>&1 | tail -8
                rc=${PIPESTATUS[0]}
                ;;
            zypper)
                $SUDO zypper install -y mozilla-nss libatk-1_0-0 at-spi2-atk at-spi2-core \
                    libXcomposite1 libXdamage1 libXrandr1 libxkbcommon0 \
                    libgbm1 libasound2 libpango-1_0-0 libcairo2 gtk3 libdrm2 mozilla-nspr 2>&1 | tail -8
                rc=${PIPESTATUS[0]}
                ;;
            apk)
                $SUDO apk add --no-cache nss atk at-spi2-atk at-spi2-core \
                    libxcomposite libxdamage libxrandr libxkbcommon mesa-gbm alsa-lib pango cairo gtk+3.0 libdrm nspr 2>&1 | tail -8
                rc=${PIPESTATUS[0]}
                ;;
            xbps)
                $SUDO xbps-install -Sy nss atk at-spi2-atk at-spi2-core \
                    libXcomposite libXdamage libXrandr libxkbcommon libgbm alsa-lib pango cairo gtk+3 libdrm nspr 2>&1 | tail -8
                rc=${PIPESTATUS[0]}
                ;;
            rpm-ostree)
                warn "Immutable/atomic system – libraries are usually present. If the app fails, run:"
                warn "  rpm-ostree install nss atk at-spi2-atk at-spi2-core mesa-libgbm alsa-lib pango cairo gtk3"
                ;;
            *)
                [ "$IS_NIXOS" = "1" ] && warn "NixOS: add nss atk at-spi2-atk at-spi2-core mesa pango cairo gtk3 alsa-lib to configuration."
                ;;
        esac
        return "$rc"
    }
    if install_electron_deps; then
        echo "  ✅ Runtime libraries step complete"
    else
        warn "Some runtime libraries could not be installed."
    fi
fi

echo ""
echo "  Step 4: Installing Flatpak (if needed)..."
if ! command -v flatpak &>/dev/null; then
    case "$PM" in
        apt)    $SUDO apt-get install -y -qq flatpak ;;
        dnf)    $SUDO dnf install -y flatpak ;;
        yum)    $SUDO yum install -y flatpak ;;
        pacman) $SUDO pacman -Sy --noconfirm flatpak ;;
        zypper) $SUDO zypper install -y flatpak ;;
        apk)    $SUDO apk add flatpak ;;
        xbps)   $SUDO xbps-install -Sy flatpak ;;
    esac
fi
if command -v flatpak &>/dev/null; then
    echo "  ✅ Flatpak ready"
    if ! flatpak remote-list 2>/dev/null | grep -q flathub; then
        echo "  Adding Flathub remote..."
        flatpak remote-add --if-not-exists --user flathub https://flathub.org/repo/flathub.flatpakrepo || true
    fi
else
    warn "Flatpak not available."
fi

echo ""
echo "  Step 5: Checking for a polkit agent..."
POLKIT_RUNNING=0
if pgrep -f "polkit-gnome-authentication-agent|polkit-kde-authentication-agent|lxpolkit|mate-polkit|xfce-polkit|ukui-polkit" &>/dev/null; then
    POLKIT_RUNNING=1
fi
if [ "$POLKIT_RUNNING" = "1" ]; then
    echo "  ✅ A polkit agent is already running"
else
    echo "  No polkit agent detected – installing lxpolkit..."
    case "$PM" in
        apt)    $SUDO apt-get install -y -qq lxpolkit 2>/dev/null || true ;;
        dnf|yum) $SUDO "$PM" install -y lxsession 2>/dev/null || true ;;
        pacman) $SUDO pacman -Sy --noconfirm lxsession 2>/dev/null || true ;;
        zypper) $SUDO zypper install -y lxpolkit 2>/dev/null || true ;;
        apk)    $SUDO apk add lxpolkit 2>/dev/null || true ;;
        xbps)   $SUDO xbps-install -Sy lxsession 2>/dev/null || true ;;
    esac
    command -v lxpolkit &>/dev/null && echo "  ✅ lxpolkit installed" || warn "Could not install a polkit agent."
fi

echo ""
echo "  Step 6: Installing npm packages..."
INSTALL_DIR="$HOME/.local/share/compass"
mkdir -p "$INSTALL_DIR"
cp -f "$DIR/main.js" "$DIR/preload.js" "$DIR/index.html" "$DIR/package.json" "$INSTALL_DIR/"
cd "$INSTALL_DIR"
if ! npm install --production; then
    fail "npm install failed. Check your network connection."
fi
echo "  ✅ Packages installed to $INSTALL_DIR"

echo ""
echo "  Step 7: Creating/installing system icon..."
ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"
mkdir -p "$ICON_DIR"

# Generate the beautiful 3D Compass SVG natively
cat > "$INSTALL_DIR/icon.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#000" flood-opacity="0.45"/>
    </filter>
    <radialGradient id="outerRim" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#f0f0f0"/>
      <stop offset="60%" stop-color="#b0b0b0"/>
      <stop offset="100%" stop-color="#707070"/>
    </radialGradient>
    <linearGradient id="innerRim" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#cfd8dc"/>
      <stop offset="50%" stop-color="#90a4ae"/>
      <stop offset="100%" stop-color="#546e7a"/>
    </linearGradient>
    <linearGradient id="redQuad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff8a80"/>
      <stop offset="100%" stop-color="#c62828"/>
    </linearGradient>
    <linearGradient id="greenQuad" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#a5d6a7"/>
      <stop offset="100%" stop-color="#2e7d32"/>
    </linearGradient>
    <linearGradient id="yellowQuad" x1="100%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#fff59d"/>
      <stop offset="100%" stop-color="#f9a825"/>
    </linearGradient>
    <linearGradient id="blueQuad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#81d4fa"/>
      <stop offset="100%" stop-color="#0277bd"/>
    </linearGradient>
    <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2c2c2c"/>
      <stop offset="25%" stop-color="#8a8a8a"/>
      <stop offset="50%" stop-color="#d4d4d4"/>
      <stop offset="75%" stop-color="#6e6e6e"/>
      <stop offset="100%" stop-color="#1a1a1a"/>
    </linearGradient>
    <radialGradient id="pivotGrad" cx="40%" cy="30%" r="60%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="40%" stop-color="#b0bec5"/>
      <stop offset="100%" stop-color="#37474f"/>
    </radialGradient>
    <path id="quadRed" d="M256,36 A220,220 0 0,0 36,256 L256,256 Z"/>
    <path id="quadGreen" d="M256,36 A220,220 0 0,1 476,256 L256,256 Z"/>
    <path id="quadYellow" d="M476,256 A220,220 0 0,1 256,476 L256,256 Z"/>
    <path id="quadBlue" d="M256,476 A220,220 0 0,1 36,256 L256,256 Z"/>
  </defs>

  <!-- Outer Drop Shadow -->
  <circle cx="256" cy="256" r="245" fill="rgba(0,0,0,0.3)" filter="url(#shadow)"/>

  <!-- Outer Rim -->
  <circle cx="256" cy="256" r="245" fill="url(#outerRim)" stroke="#888" stroke-width="3"/>

  <!-- Inner Rim -->
  <circle cx="256" cy="256" r="220" fill="url(#innerRim)" stroke="#555" stroke-width="2"/>

  <!-- Colored Quadrants -->
  <use href="#quadRed" fill="url(#redQuad)"/>
  <use href="#quadGreen" fill="url(#greenQuad)"/>
  <use href="#quadYellow" fill="url(#yellowQuad)"/>
  <use href="#quadBlue" fill="url(#blueQuad)"/>

  <!-- Glossy Highlights (Texture) -->
  <path d="M256,36 A220,220 0 0,0 36,256 A140,140 0 0,1 180,80 A80,80 0 0,0 256,36 Z" fill="rgba(255,255,255,0.25)"/>
  <path d="M256,476 A220,220 0 0,0 36,256 A140,140 0 0,1 180,432 A80,80 0 0,0 256,476 Z" fill="rgba(255,255,255,0.15)"/>

  <!-- Tick Marks (N,E,S,W) -->
  <rect x="236" y="44" width="40" height="16" rx="4" fill="#111111"/>
  <rect x="236" y="452" width="40" height="16" rx="4" fill="#111111"/>
  <rect x="44" y="236" width="16" height="40" rx="4" fill="#111111"/>
  <rect x="452" y="236" width="16" height="40" rx="4" fill="#111111"/>

  <!-- Arrow Shape (Top - North) -->
  <path d="M256,80 L320,210 L280,210 L280,260 L232,260 L232,210 L192,210 Z" fill="url(#arrowGrad)" stroke="#111" stroke-width="3" stroke-linejoin="round"/>
  <!-- Arrow Shape (Bottom - South) -->
  <path d="M256,432 L320,302 L280,302 L280,252 L232,252 L232,302 L192,302 Z" fill="url(#arrowGrad)" stroke="#111" stroke-width="3" stroke-linejoin="round"/>

  <!-- Center Pivot -->
  <circle cx="256" cy="256" r="24" fill="url(#pivotGrad)" stroke="#222" stroke-width="2"/>
  <circle cx="248" cy="248" r="8" fill="rgba(255,255,255,0.6)"/>
</svg>
SVG

cp -f "$INSTALL_DIR/icon.svg" "$ICON_DIR/compass.svg"
command -v gtk-update-icon-cache &>/dev/null && gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null
echo "  ✅ Custom 3D compass icon installed to system"

echo ""
echo "  Step 8: Creating launcher..."
cat > "$INSTALL_DIR/compass" <<LAUNCHER
#!/usr/bin/env bash
INSTALL_DIR="$INSTALL_DIR"
cd "\$INSTALL_DIR"
LOG="\$INSTALL_DIR/launch.log"

export NVM_DIR="\$HOME/.nvm"
if [ -d "\$NVM_DIR/versions/node" ]; then
    LATEST_NODE_BIN="\$(ls -d "\$NVM_DIR"/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
    [ -n "\$LATEST_NODE_BIN" ] && export PATH="\$LATEST_NODE_BIN:\$PATH"
fi

if ! pgrep -f "polkit-gnome-authentication-agent|polkit-kde-authentication-agent|lxpolkit|mate-polkit|xfce-polkit|ukui-polkit" &>/dev/null; then
    if command -v lxpolkit &>/dev/null; then
        nohup lxpolkit >/dev/null 2>&1 & disown
    fi
fi

show_error() {
    echo "\$1" >> "\$LOG"
    if command -v zenity &>/dev/null; then
        zenity --error --title="Compass" --text="\$1\n\nFull log: \$LOG" --width=440 2>/dev/null
    elif command -v kdialog &>/dev/null; then
        kdialog --error "\$1\nFull log: \$LOG" 2>/dev/null
    elif command -v xmessage &>/dev/null; then
        xmessage -center "\$1 (see \$LOG)" 2>/dev/null
    fi
}

ELECTRON_BIN="\$INSTALL_DIR/node_modules/electron/dist/electron"
[ ! -x "\$ELECTRON_BIN" ] && ELECTRON_BIN="\$INSTALL_DIR/node_modules/.bin/electron"
echo "--- launch \$(date) ---" >> "\$LOG"
echo "Using ELECTRON_BIN=\$ELECTRON_BIN" >> "\$LOG"

if [ ! -x "\$ELECTRON_BIN" ]; then
    show_error "Compass's Electron runtime is missing (\$ELECTRON_BIN). Try re-running install.sh."
    exit 1
fi

OUT="\$("\$ELECTRON_BIN" "\$INSTALL_DIR/main.js" "\$@" 2>&1)"
STATUS=\$?
echo "\$OUT" >> "\$LOG"

if [ \$STATUS -ne 0 ] && echo "\$OUT" | grep -qiE "sandbox|SUID"; then
    echo "Sandbox launch failed – retrying with --no-sandbox..." >> "\$LOG"
    OUT2="\$("\$ELECTRON_BIN" "\$INSTALL_DIR/main.js" --no-sandbox "\$@" 2>&1)"
    STATUS2=\$?
    echo "\$OUT2" >> "\$LOG"
    if [ \$STATUS2 -ne 0 ]; then
        show_error "Compass failed to start even without the sandbox (exit code \$STATUS2)."
    fi
    exit \$STATUS2
elif [ \$STATUS -eq 127 ]; then
    show_error "Compass couldn't find a required command (exit code 127). See \$LOG."
    exit \$STATUS
elif [ \$STATUS -ne 0 ]; then
    show_error "Compass closed unexpectedly (exit code \$STATUS)."
    exit \$STATUS
fi
LAUNCHER
chmod +x "$INSTALL_DIR/compass"
echo "  ✅ Launcher created"

echo ""
echo "  Step 9: Creating menu shortcut..."
mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/compass.desktop" <<DESKTOPEOF
[Desktop Entry]
Name=Compass
Comment=Discover and install apps from Flathub, Snap, and system repositories
Exec=$INSTALL_DIR/compass
Icon=$INSTALL_DIR/icon.svg
Terminal=false
Type=Application
Categories=System;
DESKTOPEOF
chmod +x "$HOME/.local/share/applications/compass.desktop"

command -v update-desktop-database &>/dev/null && update-desktop-database "$HOME/.local/share/applications" 2>/dev/null
command -v kbuildsycoca5 &>/dev/null && kbuildsycoca5 2>/dev/null
command -v xdg-desktop-menu &>/dev/null && xdg-desktop-menu forceupdate 2>/dev/null

echo "  ✅ Menu shortcut created (may require logout/login to appear in some environments)."

echo ""
if [ "$WARNED" = "1" ]; then
    echo "  ╔══════════════════════════════════════╗"
    echo "  ║  ✅ COMPASS INSTALLED – with warnings ║"
    echo "  ╚══════════════════════════════════════╝"
else
    echo "  ╔══════════════════════════════════════╗"
    echo "  ║     ✅ COMPASS INSTALLED!            ║"
    echo "  ╚══════════════════════════════════════╝"
fi
echo ""
echo "  Find 'Compass' in your application menu"
echo "  Or run: $INSTALL_DIR/compass"
echo "  (Launch log: $INSTALL_DIR/launch.log)"
echo ""

if [ "$IS_NIXOS" = "1" ]; then
    echo "  👉 NixOS detected! You must run the app inside the nix-shell environment."
    echo "     Navigate to this folder and run: nix-shell"
else
    "$INSTALL_DIR/compass" &
fi
