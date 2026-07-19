#!/bin/bash
set -e

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

    while sudo fuser $lock_files >/tmp/cocktail-apt-locks 2>/dev/null; do
        if [ "$waited" -ge 60 ]; then
            echo "  - apt/dpkg is still busy after 60s."
            echo "  - lock owner process ids: $(cat /tmp/cocktail-apt-locks 2>/dev/null || echo unknown)"
            echo "  - wait for Ubuntu unattended upgrades/cloud-init to finish, then click Enroll Again."
            exit 75
        fi
        echo "  - waiting for apt/dpkg lock... ${waited}s ($(cat /tmp/cocktail-apt-locks 2>/dev/null || echo checking))"
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

wait_for_apt
if [ -n "$UPDATE_CMD" ]; then
    echo "  - refreshing package metadata"
    eval "$UPDATE_CMD" || echo "    package metadata refresh failed, continuing"
fi
if [ -n "$INSTALL_CMD" ]; then
    run_optional "installing curl and iproute2" $INSTALL_CMD curl iproute2 || true
    # Try multiple fetch alternatives in order of preference
    run_optional "installing system info helper" $INSTALL_CMD fastfetch || run_optional "installing system info helper fallback" $INSTALL_CMD screenfetch || run_optional "installing system info helper fallback" $INSTALL_CMD neofetch || true
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
  eval "$NODE_INSTALL"
fi

if ! command -v pnpm >/dev/null; then
  if command -v corepack >/dev/null; then
    echo "Activating pnpm..."
    corepack enable
    corepack prepare pnpm@11.7.0 --activate
  else
    echo "Error: pnpm is required, but corepack is not available to activate it."
    exit 1
  fi
fi

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
curl -ksSL "$SERVER_URL/cocktail/dist/index.js" -o "$INSTALL_DIR/dist/index.js"
curl -ksSL "$SERVER_URL/cocktail/package.json" -o "$INSTALL_DIR/package.json"

cd "$INSTALL_DIR"
echo "Installing dependencies..."
pnpm install --prod --ignore-scripts --silent

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

echo "Cocktail Agent installed and started!"
systemctl status cocktail --no-pager

# Show system info
if command -v fastfetch >/dev/null; then
    fastfetch
elif command -v screenfetch >/dev/null; then
    screenfetch
elif command -v neofetch >/dev/null; then
    neofetch
fi
