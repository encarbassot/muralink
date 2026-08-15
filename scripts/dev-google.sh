#!/usr/bin/env bash
# Local dev helper: run the orchester with Google Calendar sync enabled.
# The client secret stays in your JSON file (outside this repo) — this script
# only reads it at runtime and exports the values as env vars.
#
# Usage:
#   ./scripts/dev-google.sh
#   GOOGLE_CREDENTIALS_JSON=/path/to/client_secret.json ./scripts/dev-google.sh
set -euo pipefail

# Default to the first client_secret JSON in ~/.muralink rather than a
# hardcoded filename: the filename Google hands you contains your project's
# client id, and that does not belong in a public repo.
CRED="${GOOGLE_CREDENTIALS_JSON:-$(ls "$HOME"/.muralink/client_secret_*.json 2>/dev/null | head -1)}"
if [[ ! -f "$CRED" ]]; then
  echo "Credentials JSON not found: $CRED" >&2
  echo "Set GOOGLE_CREDENTIALS_JSON to its path." >&2
  exit 1
fi

# Extract client_id / client_secret from the Google "web" (or "installed") JSON.
eval "$(node -e '
  const fs = require("fs");
  const j = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const c = j.web || j.installed;
  if (!c) { console.error("Unrecognized credentials JSON"); process.exit(1); }
  process.stdout.write(
    "export GOOGLE_CLIENT_ID=" + JSON.stringify(c.client_id) + "\n" +
    "export GOOGLE_CLIENT_SECRET=" + JSON.stringify(c.client_secret) + "\n"
  );
' "$CRED")"

export GOOGLE_REDIRECT_URI="${GOOGLE_REDIRECT_URI:-http://localhost:3001/api/calendar/google/callback}"
export GOOGLE_CALENDAR_ID="${GOOGLE_CALENDAR_ID:-primary}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Google sync: client ${GOOGLE_CLIENT_ID%%-*}…  redirect ${GOOGLE_REDIRECT_URI}"
echo "Connect by opening: http://localhost:3001/api/calendar/google/auth"

# arch -arm64 forces the native slice on Apple Silicon even from a Rosetta shell
# (the orchester's better-sqlite3 / sharp binaries are arm64).
cd "$REPO_ROOT"
exec arch -arm64 npm -w @muralink/platform-server run dev
