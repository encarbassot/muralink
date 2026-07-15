# server — not yet implemented (scaffold only)

Self-hostable private local server. **API only** — the frontend lives in
`platforms/web`. The two communicate over HTTP.

- **Stack:** Node.js + Express
- **Role:** API runtime + git-based DB + file storage. Mounts a `ModuleRegistry`
  and exposes each module's `implementations/server/` routes.
- **Self-hostable:** any Linux box; single-command Docker install (nginx + API +
  git DB + file storage). User owns the code — ports, configs, git remote all editable.
- **Prior art:** `🧠/LOCAL-SERVER/betty-server` (Express on :3131, drive/notes
  routes, multer). Add: `ModuleRegistry` wiring, git-DB (`isomorphic-git`).

Deferred until `url` + `contacts` are solid (priority #7). See
[docs/deeplinks/platforms.md](../../docs/deeplinks/platforms.md) and
[docs/self-hosting.md](../../docs/self-hosting.md).
