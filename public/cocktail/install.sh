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

if command -v apt-get >/dev/null; then
    INSTALL_CMD="sudo apt-get install -y -qq"
    UPDATE_CMD="sudo apt-get update -qq"
    NODE_INSTALL="curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
elif command -v dnf >/dev/null; then
    INSTALL_CMD="sudo dnf install -y -q"
    UPDATE_CMD="sudo dnf makecache"
    NODE_INSTALL="sudo dnf install -y nodejs"
elif command -v yum >/dev/null; then
    INSTALL_CMD="sudo yum install -y -q"
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

if [ -n "$UPDATE_CMD" ]; then $UPDATE_CMD >/dev/null 2>&1 || true; fi
if [ -n "$INSTALL_CMD" ]; then
    $INSTALL_CMD curl iproute2 >/dev/null 2>&1 || true
    # Try multiple fetch alternatives in order of preference
    $INSTALL_CMD fastfetch >/dev/null 2>&1 || $INSTALL_CMD screenfetch >/dev/null 2>&1 || $INSTALL_CMD neofetch >/dev/null 2>&1 || true
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
