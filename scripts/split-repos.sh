#!/usr/bin/env bash
# split-repos.sh — publish each module/package folder of the muralink-platform
# monorepo into its OWN standalone git repo (polyrepo), preserving that folder's
# history via `git subtree split`. Re-runnable: re-syncs the standalone repos
# with the monorepo's latest.
#
# The monorepo stays the working source of truth. Each folder ALSO exists as an
# independent repo (local bare today; re-point to GitHub with wire-submodules.sh
# once the org exists). This is the Babel/React-style "monorepo dev, per-package
# repos" model.
#
# Usage:  scripts/split-repos.sh [REPOS_DIR]
#   REPOS_DIR defaults to ../muralink (sibling of the monorepo).

set -euo pipefail
cd "$(dirname "$0")/.."

REPOS_DIR="${1:-$(cd .. && pwd)/muralink}"
mkdir -p "$REPOS_DIR"

# folder → repo name. Add a line here when a new module/package should be a repo.
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

echo "$MAP" | while IFS=: read -r folder repo; do
  [ -z "$folder" ] && continue
  [ -d "$folder" ] || { echo "  ! skip $folder (missing)"; continue; }
  [ -d "$REPOS_DIR/$repo.git" ] || git init --bare -q "$REPOS_DIR/$repo.git"
  br="_split_$(echo "$repo" | tr -cd 'a-z')"
  git branch -D "$br" >/dev/null 2>&1 || true
  git subtree split -q --prefix="$folder" -b "$br" >/dev/null
  # force-push: the standalone repo is a derived mirror of the folder history.
  git push -qf "$REPOS_DIR/$repo.git" "$br:main"
  git branch -D "$br" >/dev/null 2>&1 || true
  printf "  ✓ %-22s ← %s\n" "$repo" "$folder"
done

echo "Done. Standalone repos in $REPOS_DIR"
