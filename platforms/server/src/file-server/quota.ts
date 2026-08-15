// NAS storage quota. Usage = recursive walk of the served root (including
// .uploads parts in flight), cached with a short TTL and invalidated on every
// write/delete so uploads don't pay a walk per chunk. Best-effort under
// concurrency — the init-time check is authoritative enough for a personal
// 5 GB cap, not for adversarial multi-writer accounting.
//
// maxBytes null = unlimited (the self-host default: no ELIO_NAS_MAX_BYTES).

import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const USAGE_TTL_MS = 20_000

/** Recursive byte size of a file or directory tree. Best-effort: entries that
 *  vanish mid-walk are skipped. Includes dotfiles (.uploads parts count). */
export async function du(path: string): Promise<number> {
  let st
  try {
    st = await stat(path)
  } catch {
    return 0
  }
  if (!st.isDirectory()) return st.size
  let total = 0
  let entries: string[]
  try {
    entries = await readdir(path)
  } catch {
    return 0
  }
  for (const name of entries) {
    total += await du(join(path, name))
  }
  return total
}

export interface NasQuota {
  maxBytes: number | null
  usedBytes: () => Promise<number>
  invalidate: () => void
}

export function createNasQuota(root: string, maxBytes: number | null): NasQuota {
  let cached: { at: number; promise: Promise<number> } | null = null

  return {
    maxBytes,
    usedBytes() {
      const now = Date.now()
      if (cached && now - cached.at < USAGE_TTL_MS) return cached.promise
      const promise = du(root).catch(() => 0)
      cached = { at: now, promise }
      return promise
    },
    invalidate() {
      cached = null
    },
  }
}

/** True when writing `incoming` more bytes would exceed the cap. */
export async function wouldExceed(quota: NasQuota, incoming: number): Promise<boolean> {
  if (quota.maxBytes === null) return false
  return (await quota.usedBytes()) + incoming > quota.maxBytes
}
