#!/usr/bin/env bash
#
# Cold start: turn a bare Linux box into a machine that can run the deploy
# wizard. Nothing more. It installs git and node, clones the public repo, and
# hands over to the wizard — which is where every real decision gets made.
#
#   curl -fsSL https://raw.githubusercontent.com/encarbassot/muralink/main/scripts/bootstrap.sh | bash
#
# Env overrides:
#   MURAL_REPO    git url to clone      (default: the public repo)
#   MURAL_BRANCH  branch to check out   (default: main)
#   MURAL_ROOT    where it lands        (default: ~/muralink)
#
# Deliberately does NOT use sudo for the clone or the npm install: the checkout
# belongs to the user who will run the service, not to root. Only package
# installation is privileged.

set -euo pipefail

REPO="${MURAL_REPO:-https://github.com/encarbassot/muralink.git}"
BRANCH="${MURAL_BRANCH:-main}"
ROOT="${MURAL_ROOT:-$HOME/muralink}"
NODE_MAJOR=20

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Linux" ] || die "this bootstrap targets Linux; on macOS clone the repo and run npm run orchester"
[ "$(id -u)" != "0" ] || die "run as the user that will own the instance, not as root"

# ── privileges ───────────────────────────────────────────────────────────────
# The wizard needs passwordless sudo end to end (nginx, systemd, certbot). Fail
# here rather than three minutes into a clone.
sudo -n true 2>/dev/null || die 'passwordless sudo required. Fix:
  echo "$USER ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/muralink'

# ── packages ─────────────────────────────────────────────────────────────────
if command -v apt-get >/dev/null 2>&1; then
  say "installing git and curl…"
  sudo -n env DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl ca-certificates
elif command -v dnf >/dev/null 2>&1; then
  say "installing git and curl…"
  sudo -n dnf install -y -q git curl
else
  command -v git >/dev/null 2>&1 || die "no apt-get or dnf found — install git and node $NODE_MAJOR+ by hand, then re-run"
fi

# ── node ─────────────────────────────────────────────────────────────────────
have_node=0
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge "$NODE_MAJOR" ] && have_node=1
fi

if [ "$have_node" = "0" ]; then
  say "installing node $NODE_MAJOR…"
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -n -E bash -
    sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
  elif command -v dnf >/dev/null 2>&1; then
    sudo -n dnf module install -y -q "nodejs:$NODE_MAJOR"
  fi
  command -v node >/dev/null 2>&1 || die "node install failed — install node $NODE_MAJOR+ by hand and re-run"
fi

# ── source ───────────────────────────────────────────────────────────────────
# The wizard's own `source` step does clone and update too. This one exists
# only because the wizard cannot run before the code that contains it does.
if [ -d "$ROOT/.git" ]; then
  say "updating $ROOT…"
  git -C "$ROOT" fetch --prune origin
  git -C "$ROOT" checkout "$BRANCH"
  git -C "$ROOT" merge --ff-only "origin/$BRANCH"
elif [ -e "$ROOT" ]; then
  die "$ROOT exists and is not a git checkout — move it aside or set MURAL_ROOT"
else
  say "cloning $REPO ($BRANCH) into $ROOT…"
  git clone --branch "$BRANCH" "$REPO" "$ROOT"
fi

# ── dependencies ─────────────────────────────────────────────────────────────
say "npm install (several minutes on a fresh box)…"
cd "$ROOT"
npm install --no-audit --no-fund

# ── hand over ────────────────────────────────────────────────────────────────
say "bootstrap done. Starting the deploy wizard."
printf 'Re-enter it any time with:  cd %s && npx orchester-deploy status\n\n' "$ROOT"
exec npx orchester-deploy status
