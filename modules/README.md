# modules/

Each module is a self-contained node in the dependency graph (a DAG — no cycles).
A module declares what it can show and at what sizes; the platform decides where
and how. All parts except `manifest.ts` are optional.

- **[_template/](_template/)** — copy this to create a new module.
- **[url/](url/)** — the first fully-compliant module. Reference shape. ✅ built.
- Everything else (`contacts`, `calendar`, `drive`, `expenses`, `notes`,
  `passwords`, `notion`) — scaffold READMEs only, not yet implemented.

**Dependency order (leaf → consumer):**
`types/core` → `url`, `drive` → `contacts` → `expenses`; `calendar`, `notes`,
`passwords`; `notion` (adapter over `notes` + `drive`).

See [docs/deeplinks/types-and-modules.md](../docs/deeplinks/types-and-modules.md).
