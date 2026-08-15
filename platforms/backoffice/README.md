# platforms/backoffice

The operator's console: instances, the module catalogue, tunnels and billing.
This is the screen the person *running* the service uses, not the person using
an instance.

```sh
npm run dev -w @muralink/platform-backoffice
```

## What lives here

- **[src/pages/Dashboard.tsx](src/pages/Dashboard.tsx)** — instances and their
  state.
- **[src/pages/ModuleConfig.tsx](src/pages/ModuleConfig.tsx)** — the module
  catalogue and the vertical bundles (a "hair salon" bundle is a market
  segment — contacts, calendar, bookings, stock — not a customer).
- **[src/auth-context.tsx](src/auth-context.tsx) · [src/api.ts](src/api.ts)** —
  session and the API client.

## Rules

- **Nothing here is required to run an instance.** A self-hoster never opens
  this; the orchester TUI is their console. If a feature becomes necessary for a
  single-user instance to work, it is in the wrong platform.
