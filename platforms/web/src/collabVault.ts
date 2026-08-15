// Collab (shared-workspace) sync wiring for the enterprise web build. Parallel
// to cloudVault.ts, but instead of the per-account orchester HTTP space it
// registers a `collab` space per collection, pointed same-origin at the
// multi-user front. The front forwards /collab to the cloud master with the
// account token + this user's verified `who`; the master gates who→seat and
// stores opaque ciphertext. Everyone on the subscription edits ONE workspace,
// with per-item authorship.
//
// Only mount this in enterprise (multi-user) mode. `who` is the signed-in user
// id (from /auth/me); `workspaceKey` is the shared workspace passphrase — the
// same value for every seat, provided by the deployment (never sent to the
// server). Key distribution across seats is a deployment concern.

import { registerSpace, unregisterSpace, makeCollabSpace } from '@muralink/spaces'
import { useNotes } from '@muralink/module-notes/web'
import { useContacts } from '@muralink/module-contacts/web'
import { useEvents } from '@muralink/module-calendar/web'
import type { YCalendarEvent } from '@muralink/module-calendar/types'

const COLLAB_ID = 'collab'
let installedFor: string | null = null

interface SpacedStore {
  getState: () => {
    activeSpaces: string[]
    setDefaultSpace: (id: string) => void
    toggleSpace: (id: string) => void
  }
}

function bindCollab(store: SpacedStore): void {
  const s = store.getState()
  if (typeof s.toggleSpace === 'function' && !s.activeSpaces.includes(COLLAB_ID)) {
    s.toggleSpace(COLLAB_ID)
  }
}

// baseUrl '' = same-origin (the front). token = the user's FRONT session. who =
// the signed-in user id. workspaceKey = shared workspace passphrase.
export function installCollabVault(
  token: string,
  baseUrl: string,
  who: string,
  workspaceKey: string,
): void {
  if (installedFor === token) return
  installedFor = token

  const common = { url: baseUrl, token, who, passphrase: workspaceKey, id: COLLAB_ID }

  registerSpace('notes', makeCollabSpace({ ...common, collection: 'notes' }))
  registerSpace('contacts', makeCollabSpace({ ...common, collection: 'contacts' }))
  registerSpace('events', makeCollabSpace<YCalendarEvent>({ ...common, collection: 'events' }))

  bindCollab(useNotes as unknown as SpacedStore)
  bindCollab(useContacts as unknown as SpacedStore)

  const ev = useEvents.getState()
  if (!ev.activeTargets.includes(COLLAB_ID)) ev.toggleTarget(COLLAB_ID)
  void ev.reload()
}

export function uninstallCollabVault(): void {
  installedFor = null
  unregisterSpace('notes', COLLAB_ID)
  unregisterSpace('contacts', COLLAB_ID)
  unregisterSpace('events', COLLAB_ID)
  const ev = useEvents.getState()
  if (ev.activeTargets.includes(COLLAB_ID)) ev.toggleTarget(COLLAB_ID)
}
