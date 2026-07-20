#!/bin/bash
set -e
trap 'echo "Error: installer failed at line $LINENO while running: $BASH_COMMAND"' ERR

# Arguments
SERVER_URL=""
TOKEN=""
DEVICE_ID=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --serverUrl) SERVER_URL="$2"; shift ;;
        --token) TOKEN="$2"; shift ;;
        --deviceId) DEVICE_ID="$2"; shift ;;
    esac
    shift
done

if [ -z "$SERVER_URL" ] || [ -z "$TOKEN" ] || [ -z "$DEVICE_ID" ]; then
  echo "Usage: install.sh --serverUrl <url> --token <token> --deviceId <id>"
  exit 1
fi

echo "Installing Cocktail Agent..."
echo "Server: $SERVER_URL"
echo "Device: $DEVICE_ID"

# 0. Dependencies
echo "Ensuring dependencies..."
INSTALL_CMD=""
UPDATE_CMD=""
FETCH_PKG="fastfetch"
export DEBIAN_FRONTEND=noninteractive

run_optional() {
    local label="$1"
    shift
    echo "  - $label"
    if "$@"; then
        echo "    ok"
        return 0
    else
        echo "    skipped or failed, continuing"
        return 1
    fi
}

wait_for_apt() {
    if ! command -v apt-get >/dev/null; then
        return 0
    fi

    local waited=0
    local lock_files="/var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock"
    local takeover_after=20

    apt_lock_pids() {
        sudo fuser $lock_files 2>/dev/null | tr ' ' '\n' | awk '/^[0-9]+$/ { print }' | sort -u
    }

    repair_dpkg() {
        echo "  - repairing package database before continuing"
        sudo dpkg --configure -a
        sudo apt-get -f install -y -o DPkg::Lock::Timeout=60 >/dev/null 2>&1 || true
    }

    take_over_apt_locks() {
        local pids="$1"
        local pid=""
        local killed_any=0

        for pid in $pids; do
            local command_name
            command_name="$(ps -o comm= -p "$pid" 2>/dev/null | tr -d ' ')"

            case "$command_name" in
                apt|apt-get|dpkg|unattended-upgr)
                    echo "  - taking apt priority: stopping $command_name pid $pid"
                    sudo kill "$pid" >/dev/null 2>&1 || true
                    killed_any=1
                    ;;
                *)
                    echo "  - apt lock is held by $command_name pid $pid; leaving it alone"
                    ;;
            esac
        done

        if [ "$killed_any" -eq 0 ]; then
            return 1
        fi

        sleep 3

        for pid in $pids; do
            if ps -p "$pid" >/dev/null 2>&1; then
                local command_name
                command_name="$(ps -o comm= -p "$pid" 2>/dev/null | tr -d ' ')"
                case "$command_name" in
                    apt|apt-get|dpkg|unattended-upgr)
                        echo "  - force stopping stuck $command_name pid $pid"
                        sudo kill -9 "$pid" >/dev/null 2>&1 || true
                        ;;
                esac
            fi
        done

        repair_dpkg
        return 0
    }

    while sudo fuser $lock_files >/tmp/cocktail-apt-locks 2>/dev/null; do
        local pids
        pids="$(apt_lock_pids)"

        if [ "$waited" -ge "$takeover_after" ]; then
            echo "  - apt/dpkg still busy after ${takeover_after}s; taking priority for Cockpit install"
            echo "  - lock owner process ids: ${pids:-unknown}"
            if take_over_apt_locks "$pids"; then
                break
            fi

            echo "  - could not safely clear apt/dpkg lock owners"
            exit 75
        fi

        echo "  - waiting for apt/dpkg lock... ${waited}s (${pids:-checking})"
        sleep 5
        waited=$((waited + 5))
    done

    rm -f /tmp/cocktail-apt-locks >/dev/null 2>&1 || true
}

if command -v apt-get >/dev/null; then
    INSTALL_CMD="sudo apt-get install -y -o DPkg::Lock::Timeout=180"
    UPDATE_CMD="sudo apt-get update -o DPkg::Lock::Timeout=180"
    NODE_INSTALL="curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y -o DPkg::Lock::Timeout=180 nodejs"
elif command -v dnf >/dev/null; then
    INSTALL_CMD="sudo dnf install -y"
    UPDATE_CMD="sudo dnf makecache"
    NODE_INSTALL="sudo dnf install -y nodejs"
elif command -v yum >/dev/null; then
    INSTALL_CMD="sudo yum install -y"
    UPDATE_CMD="sudo yum makecache"
    NODE_INSTALL="sudo yum install -y nodejs"
elif command -v pacman >/dev/null; then
    INSTALL_CMD="sudo pacman -S --noconfirm --needed"
    UPDATE_CMD="sudo pacman -Sy"
    NODE_INSTALL="sudo pacman -S --noconfirm nodejs"
elif command -v apk >/dev/null; then
    INSTALL_CMD="sudo apk add"
    UPDATE_CMD="sudo apk update"
    NODE_INSTALL="sudo apk add nodejs"
elif command -v zypper >/dev/null; then
    INSTALL_CMD="sudo zypper install -y"
    UPDATE_CMD="sudo zypper refresh"
    NODE_INSTALL="sudo zypper install -y nodejs"
fi

if ! command -v curl >/dev/null || ! command -v ip >/dev/null; then
    wait_for_apt
    if [ -n "$UPDATE_CMD" ]; then
        echo "  - refreshing package metadata"
        eval "$UPDATE_CMD" || echo "    package metadata refresh failed, continuing"
    fi
    if [ -n "$INSTALL_CMD" ]; then
        run_optional "installing curl and iproute2" $INSTALL_CMD curl iproute2 || true
    fi
else
    echo "  - required tools already available"
fi

if ! command -v fastfetch >/dev/null && ! command -v screenfetch >/dev/null && ! command -v neofetch >/dev/null && [ -n "$INSTALL_CMD" ]; then
    if sudo fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock >/dev/null 2>&1; then
        echo "  - apt/dpkg busy; skipping optional system info helper"
    else
        run_optional "installing system info helper" $INSTALL_CMD fastfetch || run_optional "installing system info helper fallback" $INSTALL_CMD screenfetch || run_optional "installing system info helper fallback" $INSTALL_CMD neofetch || true
    fi
fi

# 1. Detect OS and Arch
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

if [ "$OS" != "linux" ]; then
    echo "Error: Only Linux is supported currently."
    exit 1
fi

# Ensure Node.js is installed
if ! command -v node >/dev/null; then
  echo "Installing Node.js..."
  wait_for_apt
  eval "$NODE_INSTALL"
fi
echo "Node.js: $(node -v)"

if ! command -v npm >/dev/null; then
  echo "Installing npm..."
  wait_for_apt
  if [ -n "$INSTALL_CMD" ]; then
    $INSTALL_CMD npm
  else
    echo "Error: npm is required but no package installer was detected."
    exit 1
  fi
fi
echo "npm: $(npm -v)"

echo "Detected: $OS / $ARCH"

# 2. Prepare Directories
INSTALL_DIR="/opt/cocktail"
CONFIG_DIR="/etc/cocktail"
mkdir -p "$INSTALL_DIR/dist"
mkdir -p "$CONFIG_DIR"
chown -R root:root "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"

# 3. Download Source & Package
echo "Downloading agent source..."
curl -kfSL "$SERVER_URL/cocktail/dist/index.js" -o "$INSTALL_DIR/dist/index.js"
curl -kfSL "$SERVER_URL/cocktail/package.json" -o "$INSTALL_DIR/package.json"
test -s "$INSTALL_DIR/dist/index.js"
test -s "$INSTALL_DIR/package.json"
echo "Downloaded agent package."

cd "$INSTALL_DIR"
echo "Installing dependencies..."
npm install --omit=dev --ignore-scripts --no-audit --no-fund

# 4. Create Systemd Service
SERVICE_FILE="/etc/systemd/system/cocktail.service"

echo "Cleaning up existing service..."
systemctl stop cocktail >/dev/null 2>&1 || true
systemctl disable cocktail >/dev/null 2>&1 || true
rm -f "$SERVICE_FILE"

echo "Creating systemd service..."

cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Reglook Cocktail Agent
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node dist/index.js --serverUrl "$SERVER_URL" --deviceId "$DEVICE_ID" --enrollmentToken "$TOKEN"
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# 5. Start Service
systemctl daemon-reload
systemctl enable cocktail
systemctl restart cocktail
sleep 2

echo "Cocktail Agent installed and started!"
systemctl status cocktail --no-pager --lines=20

# Show system info
if command -v fastfetch >/dev/null; then
    fastfetch
elif command -v screenfetch >/dev/null; then
    screenfetch
elif command -v neofetch >/dev/null; then
    neofetch
fi
