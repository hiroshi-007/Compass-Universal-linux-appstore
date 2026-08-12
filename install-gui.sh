#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

detect_pm() {
    if command -v apt-get &>/dev/null; then echo apt
    elif command -v dnf &>/dev/null; then echo dnf
    elif command -v pacman &>/dev/null; then echo pacman
    elif command -v zypper &>/dev/null; then echo zypper
    elif command -v apk &>/dev/null; then echo apk
    elif command -v xbps-install &>/dev/null; then echo xbps
    else echo ""
    fi
}

pick_tool() {
    if command -v zenity &>/dev/null; then echo zenity
    elif command -v yad &>/dev/null; then echo yad
    elif command -v kdialog &>/dev/null && { command -v qdbus &>/dev/null || command -v qdbus6 &>/dev/null; }; then echo kdialog
    else echo none
    fi
}

open_terminal_fallback() {
    local msg="$1"
    if command -v zenity &>/dev/null; then zenity --info --title="Installer" --text="$msg" --width=420 2>/dev/null; fi
    for term in gnome-terminal konsole xfce4-terminal mate-terminal lxterminal tilix x-terminal-emulator xterm; do
        if command -v "$term" &>/dev/null; then
            case "$term" in
                gnome-terminal) exec gnome-terminal -- bash "$DIR/install.sh" ;;
                konsole)        exec konsole -e bash "$DIR/install.sh" ;;
                xfce4-terminal) exec xfce4-terminal -e "bash '$DIR/install.sh'" ;;
                mate-terminal)  exec mate-terminal -- bash "$DIR/install.sh" ;;
                tilix)          exec tilix -e "bash '$DIR/install.sh'" ;;
                *)              exec "$term" -e bash "$DIR/install.sh" ;;
            esac
        fi
    done
    bash "$DIR/install.sh"
}

TOOL="$(pick_tool)"
if [ "$TOOL" = "none" ] && command -v pkexec &>/dev/null; then
    PM="$(detect_pm)"
    case "$PM" in
        apt)    pkexec sh -c 'apt-get update -qq && apt-get install -y zenity' &>/dev/null ;;
        dnf)    pkexec dnf install -y zenity &>/dev/null ;;
        pacman) pkexec pacman -Sy --noconfirm zenity &>/dev/null ;;
        zypper) pkexec zypper install -y zenity &>/dev/null ;;
        apk)    pkexec apk add zenity &>/dev/null ;;
        xbps)   pkexec xbps-install -Sy zenity &>/dev/null ;;
    esac
    TOOL="$(pick_tool)"
fi

if [ "$TOOL" = "none" ]; then
    open_terminal_fallback "No graphical dialog tool found. Continuing in a terminal window."
    exit $?
fi

FIFO="$(mktemp -u "${TMPDIR:-/tmp}/compass-install.XXXXXX")"
mkfifo "$FIFO"
LOGFILE="$DIR/install-log.txt"
: > "$LOGFILE"

set -m
(
    pct=1
    text="Starting installation…"
    start_ts=$SECONDS
    bash "$DIR/install.sh" 2>&1 | while IFS= read -r line; do
        echo "$line" >> "$LOGFILE"
        case "$line" in
            *"Distro:"*) pct=2 ;;
            *"Step 1:"*) pct=5 ;;
            *"Step 2:"*) pct=12 ;;
            *"Step 3:"*) pct=30 ;;
            *"Step 4:"*) pct=60 ;;
            *"Step 5:"*) pct=68 ;;
            *"Step 6:"*) pct=75 ;;
            *"Step 7:"*) pct=93 ;;
            *"Step 8:"*) pct=95 ;;
            *"Step 9:"*) pct=97 ;;
            *"COMPASS INSTALLED"*|*"INSTALLED"*) pct=100 ;;
        esac
        elapsed=$(( SECONDS - start_ts ))
        if [ "$pct" -gt 0 ] && [ "$pct" -lt 100 ] && [ "$elapsed" -gt 2 ]; then
            remain=$(( elapsed * (100 - pct) / pct ))
            eta=" (about $(( remain / 60 ))m $(( remain % 60 ))s left)"
        else
            eta=""
        fi
        printf '%s\n' "$pct"
        printf '# %s\n' "${text}${eta}"
    done
    echo 100
    echo "# Installation finished"
) > "$FIFO" &
PIPE_PID=$!

DIALOG_RC=0
case "$TOOL" in
    zenity|yad)
        "$TOOL" --progress --title="Installing Compass" --text="Starting…" --width=460 --height=120 --auto-close < "$FIFO"
        DIALOG_RC=$?
        ;;
    kdialog)
        QDBUS="$(command -v qdbus || command -v qdbus6)"
        DBUS_REF=$(kdialog --progressbar "Starting…" 100)
        DBUS_SERVICE=$(echo "$DBUS_REF" | cut -d' ' -f1)
        DBUS_PATH=$(echo "$DBUS_REF" | cut -d' ' -f2)
        while IFS= read -r fline; do
            if [[ "$fline" =~ ^[0-9]+$ ]]; then
                "$QDBUS" "$DBUS_SERVICE" "$DBUS_PATH" Set "" value "$fline" &>/dev/null
            elif [[ "$fline" == \#* ]]; then
                "$QDBUS" "$DBUS_SERVICE" "$DBUS_PATH" setLabelText "${fline#\# }" &>/dev/null
            fi
        done < "$FIFO"
        "$QDBUS" "$DBUS_SERVICE" "$DBUS_PATH" close &>/dev/null
        ;;
esac

[ "$DIALOG_RC" -ne 0 ] && kill -TERM -"$PIPE_PID" 2>/dev/null
rm -f "$FIFO"

if grep -q "❌" "$LOGFILE" 2>/dev/null; then
    if command -v zenity &>/dev/null; then
        zenity --error --title="Installation problem" --text="The installer reported an error. Full log: $LOGFILE" --width=440 2>/dev/null
    elif command -v xmessage &>/dev/null; then
        xmessage -center "Installation problem – see $LOGFILE for details." 2>/dev/null
    fi
fi
