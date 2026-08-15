#!/usr/bin/env bash
# Rathole client — the outbound half of the Orchester tunnel (data plane).
# Dials OUT to a gateway (auto-reconnecting), so no router port-forwarding is
# needed. The gateway forwards raw bytes for your subdomain straight to the
# local port you give it here — normally your orchester's `https` service
# (see ./install-linux.sh --domain, default local port 8443). TLS terminates
# locally: the gateway never decrypts anything. See docs/self-hosting.md and
# ELOI/TUNNEL.md (design) for why.
#
# Run after install-linux.sh, once you have a gateway + token from whoever
# runs it:
#   ./scripts/install-rathole-client.sh \
#     --gateway-host <ip-or-domain> --gateway-port 2333 \
#     --service-name eloi --token <hex> [--local-port 8443]
set -euo pipefail

GATEWAY_HOST=""
GATEWAY_PORT=2333
SERVICE_NAME=""
TOKEN=""
LOCAL_PORT=8443

while [ $# -gt 0 ]; do
  case "$1" in
    --gateway-host) GATEWAY_HOST="$2"; shift 2 ;;
    --gateway-port) GATEWAY_PORT="$2"; shift 2 ;;
    --service-name) SERVICE_NAME="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --local-port) LOCAL_PORT="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$GATEWAY_HOST" ] || [ -z "$SERVICE_NAME" ] || [ -z "$TOKEN" ]; then
  echo "Usage: $0 --gateway-host <ip> --gateway-port 2333 --service-name <name> --token <hex> [--local-port 8443]" >&2
  exit 1
fi

echo "==> Rathole client binary"
if ! command -v rathole >/dev/null; then
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) TARGET="x86_64-unknown-linux-gnu" ;;
    aarch64) TARGET="aarch64-unknown-linux-gnu" ;;
    *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
  esac
  # Capture curl's output fully before piping into grep/head — grep -m1/head -1
  # close the pipe early, which SIGPIPEs a still-writing curl (exit 23) and,
  # under `set -o pipefail`, aborts the script even though we already got the
  # line we wanted.
  LATEST_JSON="$(curl -fsSL https://api.github.com/repos/rapiz1/rathole/releases/latest)"
  TAG="$(printf '%s' "$LATEST_JSON" | grep -m1 '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')"
  RELEASE_JSON="$(curl -fsSL "https://api.github.com/repos/rapiz1/rathole/releases/tags/$TAG")"
  ASSET_URL="$(printf '%s' "$RELEASE_JSON" \
    | grep -o "\"browser_download_url\": *\"[^\"]*${TARGET}[^\"]*\"" \
    | head -1 | sed -E 's/.*"(https[^"]+)"/\1/')"
  if [ -z "$ASSET_URL" ]; then
    echo "Could not find a rathole release asset for $TARGET (tag $TAG)" >&2
    exit 1
  fi
  command -v unzip >/dev/null || sudo apt-get install -y unzip
  TMP="$(mktemp -d)"
  curl -fsSL "$ASSET_URL" -o "$TMP/rathole.pkg"
  # Release assets are a .zip today; try tar too in case that ever changes —
  # both just read the content, the .pkg name doesn't matter to either.
  ( cd "$TMP" && (unzip -q rathole.pkg || tar xzf rathole.pkg) )
  sudo install -m 755 "$TMP/rathole" /usr/local/bin/rathole
  rm -rf "$TMP"
else
  echo "    already installed: $(rathole --version 2>&1 | head -1)"
fi

echo "==> Writing config"
ELIO_HOME="${ELIO_HOME:-$HOME/.elio}"
mkdir -p "$ELIO_HOME"
cat > "$ELIO_HOME/rathole-client.toml" <<EOF
[client]
remote_addr = "$GATEWAY_HOST:$GATEWAY_PORT"

[client.services.$SERVICE_NAME]
token = "$TOKEN"
local_addr = "127.0.0.1:$LOCAL_PORT"
EOF
echo "    wrote $ELIO_HOME/rathole-client.toml"

echo "==> Installing systemd unit"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sed -e "s#__USER__#$(whoami)#g" \
    -e "s#__CONFIG__#$ELIO_HOME/rathole-client.toml#g" \
    "$REPO_ROOT/scripts/rathole-client.service" | sudo tee /etc/systemd/system/rathole-client.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now rathole-client

echo ""
echo "==> Done"
echo "    tunnel:  $SERVICE_NAME.<gateway domain> -> this machine's 127.0.0.1:$LOCAL_PORT"
echo "    logs:    journalctl -u rathole-client -f"
