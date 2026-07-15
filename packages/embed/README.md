# @muralink/embed

**Drop-in React surface for [Muralink](https://mural.ink).** A recursive bento
dashboard — notes, reminders, contacts and a calendar as drag/resize widgets,
nested sub-dashboards, and an in-place + full-screen markdown editor — plus the
individual apps and the raw grid engine. **Local-first**: works fully offline
(IndexedDB), zero backend, no account. Sharing/sync is opt-in.

> **You own the code.** MIT, published as free source. If our company disappears
> tomorrow you keep everything and can keep maintaining it.

```bash
npm i @muralink/embed react react-dom
```

```tsx
import { MuralDashboard } from '@muralink/embed'
import '@muralink/embed/theme.css'   // load the stylesheet once, anywhere

export default function App() {
  return <MuralDashboard theme="dark" user={{ id: 'u1', name: 'Eloi' }} />
}
```

That's a complete offline dashboard. Everything below is optional.
`MuralDashboard` fills its parent — give the parent a height.

---

## What you get (exports)

| Export | What it is |
|---|---|
| `MuralDashboard` | **The full experience.** Recursive bento grid: add/drag/resize widgets, nested sub-dashboards, markdown-in-modal. |
| `MuralBoard` | Simpler tabbed workspace (Notes / Reminders / Contacts / Calendar tabs). |
| `MuralProvider` | Theme + identity + storage context. Wraps anything; the two components above include it internally. |
| `Notes`, `Reminders`, `Contacts`, `Calendar` | The individual apps, each self-contained and mountable on its own. |
| `useNotes`, `useReminders`, `useContacts`, `useEvents` | The zustand stores behind each app (read/mutate data directly). |
| `registerSpace`, `makeHttpSpace`, `makeIdbSpace`, `makeJsonContactsAdapter` | Extend where data lives / plug an external CRM into contacts. |
| `BentoGrid`, `GridCanvas`, `useGridLayout`, … | The raw grid engine, to build your own layouts. |
| `MarkdownEditor` | The standalone CodeMirror markdown editor. |
| Types: `YNote`, `YContact`, `YReminder`, `YCalendarEvent`, `MuralUser`, … | The data contract. |

> **One stylesheet, once.** Import `@muralink/embed/theme.css` a single time in
> your app (any entry file). The components render under a `.mural-root` scope so
> they never leak styles into your page.

---

## `MuralDashboard` — props

```tsx
<MuralDashboard
  theme="dark"                       // 'dark' | 'light'
  tokens={{ '--accent': '#16a34a' }} // override CSS design tokens
  user={{ id, name, role?, color? }} // who's using it (attribution)
  spaces={{ orchester: { baseUrl: '/api', token } }} // opt-in remote sync
  columns={4}                        // grid columns (default 6)
  storageKey="pb:u1:board"           // localStorage namespace (isolate boards)
/>
```

- **`storageKey`** — the board layout (which widget in which cell/size, nested
  dashboards) is saved to `localStorage` under this key. Give each mount a unique
  key to keep boards separate (e.g. per user).
- **`persistenceAdapter`** — swap `localStorage` for your own layout store
  (IndexedDB, server) by passing a `GridPersistenceAdapter`.
- **`user`** — stamps `createdBy` on items and shows an identity badge; needed
  for meaningful attribution in shared spaces.
- **`spaces`** — see [Storage spaces](#storage-spaces). Omit for pure local-first.

`MuralBoard` takes the same `theme`/`tokens`/`user`/`spaces`, plus `tabs`
(subset/order), `initialTab`, and `labels` (rename tabs).

### Using the dashboard

- Toggle **edit mode** with the ✎ button (bottom-right). In edit mode: click an
  empty cell to add a widget, drag the handle to move, drag the corner to resize.
- Add a **sub-dashboard** widget and expand it (⤢) to descend; a breadcrumb lets
  you climb back. Each sub-dashboard is its own layout, nested arbitrarily deep.
- A **text/note** widget edits inline; click it (view mode) to open the
  full-screen markdown editor.
- Leave edit mode to interact with widgets normally.

---

## Storage spaces

Every item (a note, a contact, an event, a reminder) lives in **exactly one
space**. By default that's the local device. Hosts can offer more:

- **`local`** — IndexedDB. Default, offline, zero-config. Always present.
- **`orchester`** — your company's own Muralink server over HTTP. Items saved
  here are shared across everyone pointed at it (employees converge).
- **`tunnel`** — encrypted cloud backup (client-side AES-GCM; the server stores
  only ciphertext).

Enable the company server:

```tsx
<MuralDashboard
  user={{ id: 'u1', name: 'Eloi' }}
  spaces={{ orchester: { baseUrl: '/api', token: '<instance token>', label: 'Servidor' } }}
/>
```

Now each item shows a small "where is this saved" picker (local ↔ Servidor).
Items only move to the server when the user chooses — nothing leaves the device
by default. Shared spaces converge by polling (~30s) and on window focus.

**Plug your own data source** (e.g. an existing CRM) into contacts, read-only:

```tsx
import { registerSpace, makeJsonContactsAdapter } from '@muralink/embed'

registerSpace('contacts', makeJsonContactsAdapter({
  id: 'crm', label: 'Clientes',
  url: '/api/customers',                 // GET ?q=<text> → [{...}]
  toContact: (r) => ({ id: `crm-${r.id}`, name: r.name, externalId: String(r.id),
                       source: 'crm', createdAt: { iso: r.created_at, timezone: 'UTC' } }),
  externalUrl: (c) => `/customers/${c.externalId}`,   // "open in CRM" link
}))
```

---

## Individual apps & the grid engine

Mount any single app (wrap in `MuralProvider` for theme + identity + spaces):

```tsx
import { MuralProvider, Contacts } from '@muralink/embed'

<MuralProvider theme="light"><Contacts /></MuralProvider>
```

Or build your own layout from the raw engine:

```tsx
import { GridCanvas, useGridLayout } from '@muralink/embed'
```

Read/mutate data directly through the stores:

```tsx
import { useNotes } from '@muralink/embed'
const notes = useNotes((s) => s.notes)
await useNotes.getState().create({ title: 'Hi', body: '' })
```

---

## Theming

The look is driven by CSS custom properties on `.mural-root`. Override any via
the `tokens` prop (or set them yourself under `.mural-root`):

`--bg`, `--bg-elevated`, `--bg-bar`, `--border`, `--border-strong`, `--fg`,
`--fg-dim`, `--fg-faint`, `--accent`, `--danger`.

Bridging a host palette (e.g. mapping your `--pb-*` vars):

```tsx
<MuralDashboard tokens={{ '--bg': 'var(--pb-bg)', '--accent': 'var(--pb-accent)' }} />
```

---

## Requirements & guarantees

- **React ≥ 18** (peer dependency; you provide it — the bundle externalizes React).
- **No backend required.** Local-first by default; `spaces` is the only path that
  talks to a server, and it's opt-in.
- **Self-contained bundle.** The published package is one bundled ESM file with
  **no runtime `@muralink/*` dependencies** to install.
- **Contains no `/tunnel` (Muralink's cloud API) server code** — only a client to
  it. Safe to ship anywhere.

---

## Working on the package / internals

- [ARCHITECTURE.md](./ARCHITECTURE.md) — how it's built, the recursive-dashboard
  model, storage spaces, the bundle, and how to extend it.
- [AGENTS.md](./AGENTS.md) — file map and conventions for AI agents / contributors.

MIT.
