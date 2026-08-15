// Same-origin server spaces — what makes a self-hosted instance actually hold
// your data.
//
// Without this file the web build is a local-first app that only ever writes to
// the browser's IndexedDB: the orchester serves the bundle, proxies /api, keeps
// a sqlite database… and nothing ever writes to it. Open the same instance from
// your phone and it looks empty, because the data was never on the server, it
// was in the other browser. That is fine for a laptop; it is the wrong shape for
// a box you deployed so you could reach your data from anywhere.
//
// So: when the page is being served by an orchester, register an HTTP space per
// collection pointed at the same origin, and make it the DEFAULT write target.
// Local stays active as a merged read source, so anything already in IndexedDB
// keeps showing up and can be moved item by item.
//
// Mutually exclusive with cloudVault: both claim the space id 'orchester', and
// an instance is either its own server or a client of the hosted one — never
// both at once. main.tsx picks.

import { registerSpace, unregisterSpace, makeHttpSpace, type SpaceQuery } from '@muralink/spaces'
import { useNotes } from '@muralink/module-notes/web'
import { useContacts } from '@muralink/module-contacts/web'
import { useEvents } from '@muralink/module-calendar/web'
import { setVaultMetaRemote, useVault } from '@muralink/module-passwords/web'
import type { YVaultMeta } from '@muralink/module-passwords/types'
import type { YCalendarEvent } from '@muralink/module-calendar/types'

export const SERVER_ID = 'orchester'

// A collection belongs here once its server router answers REST at its mount
// root (GET / · POST / · PATCH /:id · DELETE /:id) — the shape makeHttpSpace
// speaks. Adding one is a line; the module needs no change.
const COLLECTIONS: { collection: string; path: string }[] = [
  { collection: 'notes', path: '/api/notes' },
  { collection: 'murales', path: '/api/murales' },
  { collection: 'contacts', path: '/api/contacts/contacts' },
  { collection: 'reminders', path: '/api/reminders' },
]

// Behind nginx this header is overwritten upstream, so its value is irrelevant
// there; on a plain LAN deploy (no gate) it is the real master token.
function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

interface SpacedStore {
  getState: () => {
    activeSpaces: string[]
    setDefaultSpace: (id: string) => void
    toggleSpace: (id: string) => void
    loadAll?: () => Promise<void>
  }
}

let installed = false

// Is a core actually behind this origin? /api/modules is mounted before every
// module gate, so it answers on any orchester. A 401 counts as yes: it proves a
// core is there and only says our token was not accepted, which is the normal
// answer when nginx has not injected one yet.
export async function probeServer(): Promise<boolean> {
  try {
    const res = await fetch('/api/modules', {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
    })
    return res.status < 500
  } catch {
    return false
  }
}

// Point every wired collection at this origin and make it the write target.
// Idempotent.
export function installServerVault(token: string): void {
  if (installed) return
  installed = true

  // baseUrl '' = same origin. The frontend server (or nginx) proxies /api to
  // the core, so the app never needs to know its own hostname — which is what
  // lets one build answer on localhost, a LAN ip and a public domain alike.
  const common = { baseUrl: '', token, id: SERVER_ID, label: 'Este servidor' }

  for (const { collection, path } of COLLECTIONS) {
    registerSpace(collection, makeHttpSpace({ ...common, path }))
  }

  registerSpace(
    'events',
    makeHttpSpace<YCalendarEvent>({
      ...common,
      path: '/api/calendar/events',
      toBody: (e) => ({
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        rrule: e.rrule,
        blocks: e.blocks,
        facets: e.facets,
        metadata: e.metadata,
      }),
      toParams: (q: SpaceQuery) => {
        const params = new URLSearchParams()
        if (q.from) params.set('from', q.from)
        if (q.to) params.set('to', q.to)
        return params
      },
    }),
  )

  // The password vault: sealed entries as a space, plus the PIN salt/verifier
  // over its own tiny endpoint (it is one record, not a collection). The server
  // sees ciphertext in both cases.
  registerSpace('vault-entries', makeHttpSpace({ ...common, path: '/api/passwords' }))
  // 409 on this route means two very different things, and guessing produced
  // the worst possible message: an uninstalled module was reported as "this
  // server already has a vault with a different PIN", sending you to look for
  // a vault that does not exist. The gate (requireInstalled) answers 409 for
  // every module route, so the body is what tells them apart.
  async function conflictMessage(res: Response): Promise<string> {
    const body = (await res.json().catch(() => ({}))) as { error?: string; entries?: number }
    if (body.error === 'module_not_installed') {
      return 'el módulo de contraseñas no está instalado en este servidor'
    }
    const n = body.entries ?? 0
    return `este servidor ya tiene una bóveda con otro PIN${n ? ` (${n} entradas guardadas)` : ''}`
  }

  setVaultMetaRemote({
    async get() {
      const res = await fetch('/api/passwords/meta', { headers: authHeaders(token) })
      if (res.status === 404) return null
      if (res.status === 409) throw new Error(await conflictMessage(res))
      if (!res.ok) throw new Error(`vault meta ${res.status}`)
      return (await res.json()) as YVaultMeta
    },
    async put(meta) {
      const res = await fetch('/api/passwords/meta', {
        method: 'PUT',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(meta),
      })
      if (res.status === 409) throw new Error(await conflictMessage(res))
      if (!res.ok) throw new Error(`vault meta ${res.status}`)
    },
  })

  bindServer(useNotes as unknown as SpacedStore)
  bindServer(useContacts as unknown as SpacedStore)
  bindServer(useVault as unknown as SpacedStore)
  // The vault view may already have run init() before the probe finished, in
  // which case it decided "no vault" from local storage alone. Re-run it now
  // that a remote exists, so a fresh device offers unlock instead of setup.
  useVault.getState().init()

  // The calendar names the same concept differently (targets, not spaces).
  const ev = useEvents.getState()
  if (!ev.activeTargets.includes(SERVER_ID)) ev.toggleTarget(SERVER_ID)
  ev.setDefaultTarget(SERVER_ID)
  void ev.reload()
}

// Server as default write target, local kept active for merged reads. The
// order matters: activate before making it the default, or a store that
// validates its default against the active set rejects it.
function bindServer(store: SpacedStore): void {
  const s = store.getState()
  if (typeof s.toggleSpace === 'function' && !s.activeSpaces.includes(SERVER_ID)) s.toggleSpace(SERVER_ID)
  if (typeof s.setDefaultSpace === 'function') s.setDefaultSpace(SERVER_ID)
  void s.loadAll?.()
}

export function uninstallServerVault(): void {
  installed = false
  for (const { collection } of COLLECTIONS) unregisterSpace(collection, SERVER_ID)
  unregisterSpace('events', SERVER_ID)
  unregisterSpace('vault-entries', SERVER_ID)
  setVaultMetaRemote(null)
  const ev = useEvents.getState()
  if (ev.activeTargets.includes(SERVER_ID)) ev.toggleTarget(SERVER_ID)
  ev.setDefaultTarget('local')
}
