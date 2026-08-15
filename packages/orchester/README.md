# @muralink/orchester

The thing that turns a machine into an instance. It supervises the services an
instance is made of (the core API, the frontend server, the HTTPS gateway,
tunnel agent), and it installs itself onto a host through the deploy wizard.

An old laptop in a cupboard and a company server run the same software here.

## Three entry points

```sh
npm run orchester                # the TUI — status, logs, service actions, deploy
npx orchesterd                   # the daemon alone, for systemd
npx orchester-deploy status      # the deploy checklist, headless
npx orchester-deploy apply --all
```

The CLI is the master; Electron attaches to the same daemon over a unix socket.
Both drive the same code — what you do by hand and what a provisioning script
does unattended cannot drift apart.

## What lives here

- **[src/orchester.ts](src/orchester.ts)** — the supervisor: managed services,
  drivers, status.
- **[src/daemon.ts](src/daemon.ts) · [src/client.ts](src/client.ts) ·
  [src/protocol.ts](src/protocol.ts)** — the daemon, its socket protocol, and
  `ensureDaemon()` for clients that want it running.
- **[src/frontend-server.ts](src/frontend-server.ts)** — static file server for
  the built web app plus a reverse proxy for `/api`.
- **[src/https-gateway.ts](src/https-gateway.ts) · [src/tls.ts](src/tls.ts)** —
  TLS termination and self-signed certificates for LAN use.
- **[src/deploy/](src/deploy/)** — the deploy wizard: a list of steps that each
  know how to *check* and *apply* themselves. See
  [docs/install/linux.md](../../docs/install/linux.md).
- **[src/cli/](src/cli/)** — the Ink TUI that renders all of the above.

## Rules

- **`check()` never mutates the host; `apply()` is idempotent.** Running the
  wizard twice is a supported thing, not a risk.
- **A failed step reports the real stderr**, never a summary. The operator is on
  an SSH session and needs the actual error.
- **Everything privileged goes through `sudo -n`.** A box that prompts would
  hang an unattended apply forever, so the wizard refuses to start without
  passwordless sudo rather than blocking halfway through.
