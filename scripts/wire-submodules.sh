#!/usr/bin/env bash
# wire-submodules.sh — convert the monorepo's module/package folders into git
# SUBMODULES pointing at their standalone repos. Run this ONCE the standalone
# repos have real remotes (e.g. GitHub org). Until then keep working in the
# monorepo and use split-repos.sh to sync the mirrors.
#
# DESTRUCTIVE: replaces each folder with a submodule. Commit/backup first.
#
# Usage:  scripts/wire-submodules.sh <REMOTE_BASE>
#   REMOTE_BASE e.g. https://github.com/muralink  (repo = <base>/<name>.git)
#   or a local dir e.g. /Users/me/Documents/CODE/muralink (uses <dir>/<name>.git)

set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${1:?usage: wire-submodules.sh <REMOTE_BASE>}"

MAP="
packages/types:muralink-types
packages/ui:muralink-ui
packages/shell:muralink-shell
packages/spaces:muralink-spaces
packages/core:muralink-core
packages/embed:muralink-embed
packages/orchester:muralink-orchester
packages/app:muralink-app
platforms/server:muralink-server
platforms/web:muralink-web
platforms/electronApp:muralink-electron
platforms/tunnel-web:muralink-tunnel-web
platforms/backoffice:muralink-backoffice
tunnel:muralink-tunnel
modules/calendar:muralink-calendar
modules/notes:muralink-notes
modules/contacts:muralink-contacts
modules/reminders:muralink-reminders
modules/url:muralink-url
modules/appointments:muralink-appointments
"

# Local bare dirs need protocol.file.allow=always for submodule add.
GITOPT=""
case "$BASE" in /*|file:*) GITOPT="-c protocol.file.allow=always" ;; esac

echo "$MAP" | while IFS=: read -r folder repo; do
  [ -z "$folder" ] && continue
  url="$BASE/$repo.git"
  git rm -r --cached "$folder" >/dev/null 2>&1 || true
  rm -rf "$folder"
  git $GITOPT submodule add "$url" "$folder"
  printf "  ✓ submodule %-18s → %s\n" "$folder" "$url"
done

echo "Done. Review .gitmodules and commit."
