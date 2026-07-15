<div align="center">

# Muralink

**A local-first, open-source platform for building the tools your business needs.**
Install modules (notes, contacts, calendar, reminders…), compose them into
recursive dashboards, and embed the whole thing into any app. Works fully
offline; sharing and cloud sync are opt-in.

*We don't want your data. You own the code.*

</div>

---

## What's here

This is the Muralink monorepo — the **single source of truth** for the platform.
The npm package [`@muralink/embed`](https://www.npmjs.com/package/@muralink/embed)
is a built artifact published *from* this repo (see [`packages/embed`](packages/embed)).

```
packages/
  types      @muralink/types      zero-dep primitive types (the interoperability contract)
  ui         @muralink/ui         bento grid engine (drag/resize, displacement)
  shell      @muralink/shell      app shell + cell registry
  spaces     @muralink/spaces     storage spaces: local / company server / encrypted cloud
  core       @muralink/core       module registry + dependency graph
  embed      @muralink/embed      the single public React surface  ← published to npm
modules/
  notes · contacts · calendar · reminders · url · appointments · …   installable feature modules
platforms/
  server     the orchester — API + git/sqlite storage a company runs on its own machine
  web · electron · backoffice     reference clients
instances/
  bikehunter · hair-saloon         pre-configured deployments (config + modules + theme)
```

> The cloud API ("tunnel") that powers cross-company sharing is **not** in this
> repo — this is the open platform; that mother API stays closed. Everything here
> runs fully without it.

## Use it — the embed

The fastest way in is the published package. No backend, no account:

```bash
npm i @muralink/embed react react-dom
```

```tsx
import { MuralDashboard } from '@muralink/embed'
import '@muralink/embed/theme.css'

<MuralDashboard theme="dark" user={{ id: 'u1', name: 'Eloi' }} />
```

Full docs: [`packages/embed/README.md`](packages/embed/README.md) ·
[architecture](packages/embed/ARCHITECTURE.md) · [AI/contributor map](packages/embed/AGENTS.md).

## Run the company server (optional — for sharing between employees)

The "Servidor" storage space (shared notes/contacts/calendar across a team) is
served by the orchester in [`platforms/server`](platforms/server):

```bash
npm install
ELIO_API_TOKEN=$(openssl rand -hex 32) npm run dev --workspace=platforms/server
# → http://localhost:3001  (health: /health)
```

Point the embed at it with `spaces={{ orchester: { baseUrl, token } }}`.

## Develop

```bash
npm install                                        # one install, npm workspaces
npm run build -w @muralink/embed                   # build the embed bundle
npx tsc --noEmit -p packages/embed/tsconfig.json   # typecheck
```

See [AGENTS.md](AGENTS.md) for how the repo is organized and the conventions.

## License

MIT. You own the code.
