# Distribution — npm package, repos, running the orchester, contributing

> Where the code lives, what ships to npm, how to run the instance in production,
> and how to contribute. Ground truth as of the `rebrand-muralink` branch.

---

## 1. The two brands / one codebase

- Brand: **mural.ink** → token `muralink`.
- npm scope: `@muralink/*`. Repo prefix: `muralink-`.
- The working source of truth is **one monorepo** (`muralink-platform`, this repo)
  using npm workspaces. Every official package/module *also* exists as its own
  standalone git repo (polyrepo) so it can be developed/published independently.
  Model: **monorepo dev, per-package repos**. See [REPOS.md](../REPOS.md).

The rebrand from `elio` → `muralink` is done at the package/scope/API level, but
the **runtime filesystem home and env vars are still `elio`** (`~/.elio`,
`ELIO_*`). Treat that as intentional legacy, not a bug — don't rename it casually.

---

## 2. What actually ships to npm

Only **one** package is published: **`@muralink/embed`**.

| | |
|---|---|
| Package | `@muralink/embed` |
| What | Drop-in React recursive dashboard (notes · reminders · contacts · calendar) + storage spaces. Local-first, offline, zero backend. |
| Install | `npm i @muralink/embed react react-dom` |
| Entry | `./dist/index.js` (ESM), theme at `@muralink/embed/theme.css` |
| Peer deps | `react >=18`, `react-dom >=18` (everything else is inlined) |
| Version source | `packages/embed/package.json` |

**Why only one package:** the lib build (`vite build --config vite.lib.config.ts`)
**inlines every `@muralink/*` workspace dependency** into a single `dist/index.js`
(React kept external). So consumers pull one self-contained bundle — no
dependency-order publish dance, no need to publish `@muralink/types`,
`/ui`, `/shell`, `/spaces`, `/module-*`, etc.

All the other `@muralink/*` packages listed in [REPOS.md](../REPOS.md) exist as
workspace packages and standalone repos but are **not** published to npm.

### Publishing `@muralink/embed`

Script: [`scripts/publish-embed.sh`](../scripts/publish-embed.sh). It builds the
bundle, writes a clean standalone `package.json` into a temp stage dir, copies
`dist/` + LICENSE + README, and publishes.

```sh
scripts/publish-embed.sh                 # DRY RUN — publishes nothing
scripts/publish-embed.sh --publish <otp> # real publish; otp = 6-digit 2FA code
```

Prereqs / gotchas:
- `npm login` as `encarbassot`.
- The npm org `muralink` must exist (free/public) or `@muralink/*` 404s.
- 2FA is required and npm can't prompt inside a script → pass the OTP as the 2nd
  arg. Codes expire in ~30s; use a fresh one. Publishing needs a **classic
  Automation token** for 2FA to pass non-interactively.
- To cut a new version: bump `packages/embed/package.json` `version`, then run
  the script — the publish version tracks that file.

---

## 3. Repo topology (where things live)

```
muralink-platform/            ← this repo, the umbrella. Consumers embed it as a submodule.
├── packages/
│   ├── types      @muralink/types             primitives + contracts (zero-dep)
│   ├── core       @muralink/core              ModuleRegistry, DAG
│   ├── ui         @muralink/ui                generic components
│   ├── shell      @muralink/shell             app shell
│   ├── spaces     @muralink/spaces            3-layer storage (spaces)
│   ├── app        @muralink/app               shared app mounted by web + electron
│   ├── embed      @muralink/embed             ← the ONLY npm-published package
│   └── orchester  @muralink/orchester         headless service manager (see §4)
├── modules/       calendar · notes · contacts · reminders · url · appointments (real)
│                  + scaffold stubs (_template, expenses, passwords, notion, drive, …)
├── platforms/
│   ├── server        @muralink/platform-server      Express + SQLite API runtime (the "core")
│   ├── web           @muralink/platform-web         React/Vite web app
│   ├── electronApp   @muralink/platform-electron    desktop app
│   ├── tunnel-web    @muralink/platform-tunnel-web
│   └── backoffice    @muralink/platform-backoffice
├── tunnel/        @muralink/tunnel             State-3 cloud broker (Express :4000)
└── scripts/       publish-embed · split-repos · wire-submodules · switch-context
```

### Polyrepo sync

- **Develop** in the monorepo (one `npm install`, cross-package refactor).
- **Sync standalone repos**: [`scripts/split-repos.sh`](../scripts/split-repos.sh)
  — subtree-splits each folder into its own repo preserving history. Re-runnable.
- **Cut over to submodules** (once a GitHub org exists):
  [`scripts/wire-submodules.sh`](../scripts/wire-submodules.sh) `<base-url>` —
  replaces folders with submodules. DESTRUCTIVE; deliberate action.

### Remotes right now

Pre-GitHub. Standalone repos live as **local bare repos** in `../muralink/*.git`.
This repo's remotes:

```
muralink → <local path>/muralink-platform.git
origin   → <local path>/elio-platform.git   (old)
```

When the GitHub org is ready: push each bare to GitHub, then run
`wire-submodules.sh https://github.com/muralink`. The published npm package
already points its `repository`/`homepage` at `github.com/encarbassot/mural.ink`.

---

## 4. The orchester — running an instance in production

The **orchester** (`@muralink/orchester`) is the headless service manager for one
instance. It replaced the old "Electron owns the processes" model: now a
CLI/daemon owns everything and Electron is just another client.

### Architecture

- **`orchesterd` (daemon)** — constructs the `Orchester`, registers the default
  services, and serves a **unix control socket** at `~/.elio/orchester.sock`.
  The daemon is the master. Entry: `packages/orchester/src/daemon-main.ts`.
- **`orchester` (CLI)** — an Ink TUI dashboard that connects to the daemon over
  the socket to start/stop/configure services. Entry: `src/cli/index.tsx`.
- **`OrchesterClient`** — programmatic client; `ensureDaemon()` auto-spawns the
  daemon if it isn't running. Electron uses this via a unix-socket adapter.

### Runtime home (`~/.elio`)

One well-known home shared by headless (Raspberry Pi / server) and desktop
instances. Override with `ELIO_HOME`.

```
~/.elio/
├── orchester.sock    control socket (daemon listens here)
├── orchester.json    orchester state
├── instance.json     instance identity
├── account.json      account link (optional)
├── tls/              self-signed certs for the HTTPS gateway
└── orchester.log
```

### Default services (registered on boot)

Defined in `packages/orchester/src/services/index.ts`:

| id | driver | what | default port (env) |
|---|---|---|---|
| `core` | process | headless API = `platforms/server` (Express + SQLite) | `3001` (`ELIO_CORE_PORT`) |
| `web-frontend` | web-frontend | static web app + `/api` proxy to core | `3000` (`ELIO_WEB_PORT`) |
| `nas` | embedded | serve a user-chosen folder as instance storage | — |
| `https` | embedded | TLS gateway in front of web-frontend (the public endpoint) | `8443` (`ELIO_HTTPS_PORT`) |
| `electron` | process | desktop app; start/stop from here | — |

Request path in production: **client → `https` gateway (TLS, :8443) → `web-frontend`
(:3000) → proxies `/api` → `core` (:3001)**. The HTTPS gateway is the single
endpoint a Pi/server exposes to the network; it terminates TLS with a self-signed
cert (`ensureSelfSigned`, CN/SAN = configured domain).

### Run it

No build step needed — the bins run the TS entries through `tsx` (clone-and-run):

```sh
# from the monorepo root
npm install

# daemon (foreground)
npm -w @muralink/orchester run daemon
#   or the bin:  packages/orchester/bin/orchesterd.mjs

# CLI TUI (separate terminal) — connects to the running daemon
npm run orchester
#   or:  npm -w @muralink/orchester run dev
#   or the bin:  packages/orchester/bin/orchester.mjs
```

From the TUI you start/stop/configure each service (ports, nas folder, https
domain). The daemon handles `SIGINT`/`SIGTERM` → `stopAll()` + socket close.

Env knobs: `ELIO_HOME`, `ELIO_CORE_PORT`, `ELIO_WEB_PORT`, `ELIO_HTTPS_PORT`,
`ELIO_ELECTRON_MODE` (`dev` | `built`).

### Docker / production — current state

**Honest status:** there is **no Dockerfile or docker-compose in the repo yet.**

- The orchester's `ServiceDriver` type includes `'docker'` and `'pm2'` as planned
  drivers, but only `embedded` / `process` / `web-frontend` / `share` are wired.
- [docs/self-hosting.md](self-hosting.md) *describes the intended* production
  shape — `platforms/server` as "Express API + git DB + file storage + nginx, all
  in Docker" with a `curl … | sh` installer and GUI installers under `docs/install/`
  — but those artifacts are not implemented.

**To containerize today**, the pragmatic path (matches how the bins already work):

1. Base image with Node ≥20 + `tsx`.
2. `COPY` the monorepo, `RUN npm install`.
3. Mount a volume at `ELIO_HOME` (default `~/.elio`) for persistent state/TLS.
4. `ENV ELIO_CORE_PORT/ELIO_WEB_PORT/ELIO_HTTPS_PORT`, `EXPOSE 8443` (only the
   HTTPS gateway needs to face the network).
5. `CMD` → run the daemon (`node packages/orchester/bin/orchesterd.mjs`) as PID 1,
   or run `core` + `web-frontend` directly if you don't want the full orchester.
6. Terminate TLS at the container's `https` gateway, or drop the `https` service
   and put nginx/Caddy in front (then only expose `web-frontend` :3000).

Wiring a real `docker` driver into the orchester (so services run as containers
it manages) is the natural next step — the enum slot is already reserved.

### Cross-instance sharing (State 3)

An instance never opens an inbound port to share. The **tunnel-agent**
(`src/tunnel-agent.ts`) holds a persistent **outbound** WebSocket to the cloud
Tunnel (`@muralink/tunnel`, Express :4000), mints a scoped token from its own
core per shared folder, and answers relayed guest requests credential-free. NAT-
friendly by design. Sharing therefore requires the cloud broker — deliberate, per
the project's State-1/2/3 model.

---

## 5. Contributing / updating the open source

### Where to change things

Always edit in the **monorepo** — it's the source of truth. Never hand-edit a
standalone repo; those are generated by subtree split.

```sh
npm install                                   # one install, whole workspace
npm run typecheck                             # tsc build of types + core
npm -w @muralink/embed run typecheck          # per-package checks
npm -w @muralink/embed run build              # build the publishable bundle
npm -w @muralink/embed run host:dev           # run the embed host harness (Vite)
```

Conventions (from [CLAUDE.md](../CLAUDE.md), non-negotiable):
- **Sentence case** everywhere (files, vars, comments).
- **Local-first** in every function — network is always an optional path.
- **Never hardcode a platform** inside a module — declare via `ManifestPlatform`.
- **No circular deps** between modules — need one? you need a new primitive type.
- **Every AI call labeled** — LLM functions take `aiProvider: 'platform' | 'ollama' | 'none'`.

### Contribution flow

1. Branch off `main` (current work branch: `rebrand-muralink`).
2. Make the change in the monorepo; keep it local-first and offline-safe.
3. `npm run typecheck` + relevant per-package `typecheck`/`build`. If you changed
   the embed surface, `build` must produce a clean `dist/`.
4. After code changes, `graphify update .` to refresh the knowledge graph
   (AST-only, no API cost) — per project rules.
5. Commit (Conventional Commits — see recent history: `rebrand:`, `chore(npm):`,
   `docs(embed):`).
6. Open a PR against `main`.

### Propagating to the standalone repos / npm

- To sync per-package repos after merging: run
  [`scripts/split-repos.sh`](../scripts/split-repos.sh) (re-runnable subtree
  split, preserves per-folder history).
- To ship a new embed release to consumers: bump
  `packages/embed/package.json`, then `scripts/publish-embed.sh --publish <otp>`.
- New official module? Implement it, then add it to `scripts/split-repos.sh` so it
  gets its own repo (stubs stay in the monorepo until real).

### Rewards (project design)

Accepted PRs, published modules, and received tips grant platform tokens — the
open-source contribution loop is part of the business model, not charity.
