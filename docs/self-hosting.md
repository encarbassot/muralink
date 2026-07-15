# Self-hosting

How to run your own server. Full depth in
[deeplinks/self-hosting.md](deeplinks/self-hosting.md).

## TL;DR

`platforms/server` is the self-hosted project — Express API + git DB + file
storage + nginx, all in Docker. You own the code and every config.

```sh
curl -fsSL https://[domain]/install.sh | sh
```

A GUI installer wrapper is available for Windows / Mac / Linux — see
[install/](install/).

## Three paths

1. **Pure self-host, no account** — fully offline/private, never touches our API.
2. **Self-host + our services** — your server plus optional tunnels, hosted git,
   Claude wrapper, Pay API.
3. **Fully hosted on our AWS** — an isolated fork instance with full terminal
   access.

## What you control

nginx config, ports, all files, any git remote. Our hosted frontend can iframe to
your server via a free subdomain. Multiple instances mesh through the main API.
