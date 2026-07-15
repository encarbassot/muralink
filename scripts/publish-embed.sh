#!/usr/bin/env bash
# publish-embed.sh — build @muralink/embed as a self-contained bundle and
# publish it to npm. The lib build inlines every @muralink/* workspace dep into
# one dist/index.js (React external), so this is the ONLY package that needs
# publishing — no dependency-order dance.
#
# Prereqs:
#   1. npm login  (you are 'encarbassot')
#   2. the npm org 'muralink' must exist (free, public):
#        https://www.npmjs.com/org/create  → name: muralink → plan: Free
#      Without it, publishing @muralink/* returns 404 (scope not found).
#
# Usage:
#   scripts/publish-embed.sh                     # DRY RUN (publishes nothing)
#   scripts/publish-embed.sh --publish <otp>     # real publish (otp = 6-digit
#                                                  code from your 2FA app; npm
#                                                  requires it and can't prompt
#                                                  in a script). Codes expire in
#                                                  ~30s — run with a fresh one.

set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:---dry-run}"
OTP="${2:-}"
STAGE="$(mktemp -d)/muralink-embed"
mkdir -p "$STAGE/dist"

echo "→ building @muralink/embed…"
npm run build -w @muralink/embed >/dev/null

cp packages/embed/dist/index.js packages/embed/dist/embed.css "$STAGE/dist/"
cp LICENSE "$STAGE/LICENSE"

# publish version tracks packages/embed/package.json
VER="$(node -p "require('./packages/embed/package.json').version")"

node -e '
const fs=require("fs");const S=process.argv[1];const ver=process.argv[2];
const pkg={
  name:"@muralink/embed", version:ver,
  description:"Muralink embed — drop-in React recursive dashboard (notes, reminders, contacts, calendar) with storage spaces. Local-first, offline, zero backend.",
  type:"module", main:"./dist/index.js", module:"./dist/index.js",
  exports:{".":"./dist/index.js","./theme.css":"./dist/embed.css"},
  files:["dist","README.md","LICENSE"], sideEffects:["*.css"],
  peerDependencies:{react:">=18","react-dom":">=18"},
  keywords:["muralink","dashboard","bento","notes","calendar","local-first","react","embed"],
  homepage:"https://github.com/encarbassot/muralink#readme",
  repository:{type:"git",url:"git+https://github.com/encarbassot/muralink.git"},
  bugs:{url:"https://github.com/encarbassot/muralink/issues"}, license:"MIT"
};
fs.writeFileSync(S+"/package.json",JSON.stringify(pkg,null,2)+"\n");
' "$STAGE" "$VER"

cp packages/embed/README.publish.md "$STAGE/README.md" 2>/dev/null || \
  printf '# @muralink/embed\n\nDrop-in React recursive dashboard for Muralink. `npm i @muralink/embed react react-dom`.\n' > "$STAGE/README.md"

cd "$STAGE"
if [ "$MODE" = "--publish" ]; then
  echo "→ publishing @muralink/embed@$VER (public)…"
  if [ -n "$OTP" ]; then
    npm publish --access public --otp="$OTP"
  else
    npm publish --access public
  fi
  echo "✓ published. https://www.npmjs.com/package/@muralink/embed"
else
  echo "→ DRY RUN (nothing is published). Re-run with --publish to go live."
  npm publish --dry-run --access public
fi
