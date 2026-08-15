import type { AppDescriptor, AppContentProvider, GridItem, NavNode } from '@/types/navigation'
import { listMerged, listCollections, type SpaceEntity } from '@muralink/spaces'
import { fileElementRegistry } from '@/lib/fileElementRegistry'
import { ModuleElement } from '@/components/fileElements/ModuleElement'

// Importing each module's web entry runs its `registerSpace(...)` as a side
// effect — that is what makes a collection's local (IndexedDB) space exist here.
// MVP surfaces notes + contacts; add a module import to surface it too.
import '@muralink/module-notes/web'
import '@muralink/module-contacts/web'

// "This device" = whatever is stored locally with no cloud backup: the `local`
// space (IndexedDB, StorageSpace.local === true). We never read orchester/tunnel
// spaces here, so the view is exactly the un-backed-up set.
const LOCAL_ONLY = ['local']
const ROOT_ID = 'local-device:root'

interface CollMeta {
  icon: string
  /** Human label for the kind badge on each cell. */
  kind: string
}

// Presentation per collection. Collections not listed still appear (generic
// icon + best-effort title) so a new module shows up the moment its store
// registers a local space — no hardcoded allow-list gates visibility.
const COLLECTION_META: Record<string, CollMeta> = {
  notes: { icon: '📝', kind: 'Nota' },
  contacts: { icon: '👤', kind: 'Contacto' },
  events: { icon: '📅', kind: 'Evento' },
  reminders: { icon: '⏰', kind: 'Recordatorio' },
  stock: { icon: '📦', kind: 'Artículo' },
}
const GENERIC: CollMeta = { icon: '📄', kind: 'Elemento' }

/** Best-effort display title across heterogeneous record shapes. */
function titleOf(rec: Record<string, unknown>): string {
  return (
    (rec.title as string) ||
    (rec.name as string) ||
    (rec.text as string) ||
    (rec.label as string) ||
    (rec.id as string) ||
    'Sin título'
  )
}

/** Every collection we should try to read: known ones + any registered live. */
function collections(): string[] {
  return [...new Set([...Object.keys(COLLECTION_META), ...listCollections()])]
}

export const LocalDeviceApp: AppDescriptor = {
  id: 'local-device',
  name: 'Este dispositivo',
  icon: '💾',
  rootNode: {
    id: ROOT_ID,
    label: 'Este dispositivo',
    icon: '💾',
    appId: 'local-device',
    parentId: null,
  },
  createProvider: () => new LocalDeviceProvider(),
}

// Register a bento renderer for every module content-type so BentoFileView can
// resolve `module:<collection>` → the 1x1 icon card. Called once at startup,
// after the store imports above have registered their spaces.
export function initLocalDeviceApp(): void {
  for (const coll of collections()) {
    fileElementRegistry.register(`module:${coll}`, {
      defaultSize: '1x1',
      label: COLLECTION_META[coll]?.kind ?? GENERIC.kind,
      component: ModuleElement,
    })
  }
}

class LocalDeviceProvider implements AppContentProvider {
  async getChildren(_nodeId: string): Promise<GridItem[]> {
    const out: GridItem[] = []
    for (const coll of collections()) {
      const meta = COLLECTION_META[coll] ?? GENERIC
      let records: Array<SpaceEntity & Record<string, unknown>> = []
      try {
        records = await listMerged<SpaceEntity & Record<string, unknown>>(coll, LOCAL_ONLY)
      } catch {
        // A collection with no local space (or a read failure) just contributes
        // nothing — never breaks the rest of the grid.
        records = []
      }
      for (const rec of records) {
        out.push({
          id: `${coll}:${rec.id}`,
          label: titleOf(rec),
          icon: meta.icon,
          contentType: `module:${coll}`,
          isNavigable: false,
          meta: { collection: coll, kindLabel: meta.kind, record: rec },
        })
      }
    }
    return out
  }

  // Records are leaves — nothing to navigate into (yet).
  resolveNode(_item: GridItem): NavNode | null {
    return null
  }
}
