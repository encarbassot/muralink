#!/usr/bin/env bash
# Headless Linux install for a self-hosted Muralink instance.
#
# Run from a cloned checkout:
#   git clone https://github.com/encarbassot/muralink.git && cd muralink
#   ./scripts/install-linux.sh [--port 80] [--nas-path /srv/mural-nas] [--domain eloi.mural.ink]
#
# What this does, in order — every step below is exactly one shell command,
# nothing hidden:
#   1. Check for node/git/openssl, offer to install a C compiler if missing
#      (better-sqlite3 is a native addon and needs one to build).
#   2. npm install (workspaces) + build the web frontend.
#   3. Write ~/.elio/orchester.json (per-service port/path overrides) and
#      ~/.elio/instance.json (which services boot automatically) — both are
#      plain JSON, edit them by hand any time.
#   4. If binding a port < 1024, grant the node binary cap_net_bind_service
#      via setcap instead of running the whole daemon as root.
#   5. Install + enable a systemd unit (scripts/orchesterd.service) so the
#      instance survives reboots.
#
# --domain enables the `https` service — a TLS gateway in front of
# web-frontend (self-signed cert, CN/SAN = the domain you pass). This is what
# a tunnel gateway (e.g. rathole, see scripts/install-rathole-client.sh)
# terminates traffic into: the real cert always lives here, never upstream.
set -euo pipefail

PORT=80
NAS_PATH=""
DOMAIN=""

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --nas-path) NAS_PATH="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,24p' "$0"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Preflight"
command -v node >/dev/null || { echo "node not found — install Node 20+ first" >&2; exit 1; }
command -v git  >/dev/null || { echo "git not found"  >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl not found (needed for the https gateway's self-signed cert)" >&2; exit 1; }

NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "node $NODE_MAJOR found, need >=20" >&2
  exit 1
fi

if ! command -v cc >/dev/null && ! command -v gcc >/dev/null; then
  if command -v apt-get >/dev/null; then
    echo "No C compiler found — better-sqlite3 needs one to build its native addon."
    read -r -p "Install build-essential + python3 via apt-get? [y/N] " reply
    if [ "$reply" = "y" ] || [ "$reply" = "Y" ]; then
      sudo apt-get update && sudo apt-get install -y build-essential python3
    else
      echo "Skipping — npm install may fail without a compiler." >&2
    fi
  else
    echo "No C compiler found and no apt-get — install one manually before continuing." >&2
  fi
fi

echo "==> Installing dependencies (npm workspaces)"
npm install

echo "==> Building the web frontend"
npm run build -w @muralink/platform-web

echo "==> Writing ~/.elio config"
ELIO_HOME="${ELIO_HOME:-$HOME/.elio}"
mkdir -p "$ELIO_HOME"

if [ -n "$NAS_PATH" ]; then
  mkdir -p "$NAS_PATH"
  NAS_JSON=",\"nas\":{\"path\":\"$NAS_PATH\"}"
  INSTANCE_NAS_JSON=",\"nas\":{\"rootPath\":\"$NAS_PATH\"}"
  NAS_INSTALLED=true
else
  NAS_JSON=""
  INSTANCE_NAS_JSON=""
  NAS_INSTALLED=false
fi

if [ -n "$DOMAIN" ]; then
  HTTPS_JSON=",\"https\":{\"domain\":\"$DOMAIN\"}"
  HTTPS_INSTALLED=true
else
  HTTPS_JSON=""
  HTTPS_INSTALLED=false
fi

cat > "$ELIO_HOME/orchester.json" <<EOF
{"services":{"web-frontend":{"port":$PORT}$NAS_JSON$HTTPS_JSON},"shares":[]}
EOF

cat > "$ELIO_HOME/instance.json" <<EOF
{"version":1,"installed":{"electron":false,"web":true,"nas":$NAS_INSTALLED,"https":$HTTPS_INSTALLED},"modules":[]$INSTANCE_NAS_JSON}
EOF

echo "    wrote $ELIO_HOME/orchester.json"
echo "    wrote $ELIO_HOME/instance.json"

if [ "$PORT" -lt 1024 ]; then
  echo "==> Port $PORT is privileged — granting node cap_net_bind_service"
  NODE_BIN="$(readlink -f "$(command -v node)")"
  sudo setcap 'cap_net_bind_service=+ep' "$NODE_BIN"
  echo "    setcap applied to $NODE_BIN"
  echo "    (re-run this if you ever switch/upgrade your node install — the"
  echo "     capability is attached to that exact binary, not to node in general)"
fi

echo "==> Installing systemd unit"
SERVICE_NAME="muralink-orchesterd"
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  sudo systemctl stop "$SERVICE_NAME"
fi
sed -e "s#__USER__#$(whoami)#g" \
    -e "s#__REPO__#$REPO_ROOT#g" \
    -e "s#__HOME__#$HOME#g" \
    "$REPO_ROOT/scripts/orchesterd.service" | sudo tee "/etc/systemd/system/$SERVICE_NAME.service" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"

echo ""
echo "==> Done"
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "    frontend:  http://${LAN_IP:-localhost}:${PORT}"
if [ -n "$DOMAIN" ]; then
  echo "    https:     https://${LAN_IP:-localhost}:8443  (self-signed, CN=$DOMAIN)"
fi
echo "    logs:      journalctl -u $SERVICE_NAME -f"
echo "    config:    $ELIO_HOME/orchester.json, $ELIO_HOME/instance.json"
