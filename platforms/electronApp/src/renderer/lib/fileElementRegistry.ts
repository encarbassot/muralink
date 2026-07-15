import type { FileElementDef } from '@/types/fileElement'

const registry = new Map<string, FileElementDef>()
const overrides = new Map<string, string>() // itemId → registryKey

export const fileElementRegistry = {
  register(key: string, def: FileElementDef): void {
    registry.set(key, def)
  },

  setOverride(itemId: string, key: string): void {
    overrides.set(itemId, key)
  },

  clearOverride(itemId: string): void {
    overrides.delete(itemId)
  },

  resolve(contentType: string, ext?: string, itemId?: string): FileElementDef {
    if (itemId) {
      const overrideKey = overrides.get(itemId)
      if (overrideKey) {
        const overrideDef = registry.get(overrideKey)
        if (overrideDef) return overrideDef
      }
    }
    if (ext) {
      const specific = registry.get(`${contentType}:${ext.toLowerCase()}`)
      if (specific) return specific
    }
    const base = registry.get(contentType)
    if (base) return base
    const first = registry.values().next().value
    if (first) return first
    throw new Error(`fileElementRegistry: no renderer for "${contentType}". Register before rendering.`)
  },

  listAlternatives(contentType: string): Array<{ key: string; label: string }> {
    const results: Array<{ key: string; label: string }> = []
    for (const [key, def] of registry.entries()) {
      if (key === contentType || key.startsWith(contentType + ':')) {
        results.push({ key, label: def.label })
      }
    }
    return results
  },
}
