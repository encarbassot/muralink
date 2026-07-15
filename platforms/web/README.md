# web — not yet implemented (scaffold only)

Self-hostable frontend. The primary interface — a bento grid that renders module
`ViewSpec`s. Talks to `platforms/server` over HTTP.

- **Stack:** React + Vite + TypeScript
- **Role:** mounts a `ModuleRegistry`, implements `ViewRenderer`, lays views out
  on the bento grid by `BentoSize`.
- **Self-hostable:** can be iframed into our hosted frontend (free subdomain).
- **Prior art:** `🧠/WEB_SERVICE` (React+Vite). Note: its current auth/share flow
  is a separate concern — no bento grid exists there yet; build it here.

Deferred (priority #8). See [docs/deeplinks/platforms.md](../../docs/deeplinks/platforms.md).
