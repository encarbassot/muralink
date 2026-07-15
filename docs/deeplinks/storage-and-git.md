# Deeplink — storage and git

How data is stored, the three states it can live in, and the git-based DB.

## The 3 storage states

Every piece of data in the system exists in exactly one of three states.

### State 1 — browser / device local
- `localStorage`, `IndexedDB`, filesystem (Electron / mobile).
- No server required. Works 100% offline.
- **No sharing possible.**

### State 2 — local server (private network)
- The user's own machine — an old laptop running Linux is fine.
- Git-based DB (below) + an optional SQL-style entity manager.
- Reachable only on the private network.
- **No sharing outside the LAN.**

### State 3 — cloud (our platform API)
- AWS-backed VM hosting.
- **Required for ANY sharing between users / companies.**
- Tunnels are the only bridge between entities.
- This is where the business model lives.

## Why sharing requires State 3 — by design

Sharing is the one thing that cannot happen locally. State 1 and State 2 are
private by construction. Crossing from one user/entity to another goes through
our API mesh — tunnels. This is a design decision, not a limitation: the free,
offline core never touches our servers; the moment you want to share, you opt in.

## Git-based DB

The local server uses **git as its primary persistence layer**. Each instance
has a private git repo as its database, parallel to an optional SQL-style entity
manager.

| Concept | Maps to |
|---|---|
| Entity type | a directory |
| Entity instance | a JSON file |
| Mutation | a commit |
| History | the audit log |
| Draft / staging | a branch |
| Sync to State 3 | push to a remote |

- **Each entity type maps to a directory** (e.g. `contacts/`, `notes/`).
- **Each instance is a JSON file** in that directory.
- **Every mutation is a commit** — so history *is* the audit log, for free.
- **Branches** hold drafts and staging work without touching the main line.
- **Sync** to State 3 is a `git push` to a remote: our hosted git service, or the
  user's own GitHub / GitLab.

## Parallel SQL-style entity manager

Alongside the git-DB, an optional SQL-style entity manager gives relational
queries. It is modeled visually — a drag-and-connect schema builder lives in
DESIGNER, with AI assist and a code view per block. The two stores are parallel,
not exclusive: git for history + sync, SQL-style for queries.

## Tools

- **`isomorphic-git`** — git operations in Node and the browser.
- **node `fs`** — file storage on the server.
- **`IndexedDB`** — browser-local state (State 1).

## Offline-first rule

Every feature requiring State 2 or State 3 must degrade cleanly when offline —
never throw. A view reads from local storage first; sync is a background,
opt-in path.
