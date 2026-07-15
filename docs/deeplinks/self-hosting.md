# Deeplink — self-hosting

How a user runs their own server, with or without our services.

## The self-hosted project

`platforms/server` is the self-hosted target. It is API only — the frontend
(`platforms/web`) can be self-hosted too, or you can use our hosted frontend
pointed at your server (free subdomain provided).

## Install

- **Single-command target:** `curl -fsSL https://[domain]/install.sh | sh`
  (Docker-based).
- **GUI installer wrapper** for non-technical users — Windows, Mac, Linux.
- **What it installs (all in Docker):** nginx, the Express API, the git DB, file
  storage.

## What the user controls

You own the code. You can:
- edit the nginx config,
- change ports,
- access all files,
- use any git remote (our hosted git, or your own GitHub / GitLab).

We also provide an **optional DevOps manager** tool so you don't have to deal
with containers by hand.

## Iframe + free subdomain

Our hosted frontend can iframe to a self-hosted server. We provide a free
subdomain so your instance is reachable without buying a domain.

## Multiple instances + mesh

Instances coexist — a home server + an office server + an AWS instance — and all
communicate through the main API mesh. (Cross-instance communication is a State 3
feature; see [business-model.md](business-model.md).)

## Three onboarding paths

1. **Pure self-host, no account** — fully offline/private, never touches our API.
2. **Self-host + our services** — your server, plus optional tunnels, hosted git,
   Claude wrapper, Pay API.
3. **Fully hosted on our AWS** — an isolated fork instance with full terminal
   access; we manage the underlying AWS.

See [platforms.md](platforms.md) and [storage-and-git.md](storage-and-git.md).
