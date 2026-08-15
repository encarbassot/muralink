// Module install seam — the orchester's record of which bundled modules are
// actually active on this instance. Mounted at /api/modules.
//
// Three pieces:
//   - the table: one row per catalog module, `installed` 0/1.
//   - the gate: requireInstalled() wraps a module's routes so an uninstalled
//     module answers 409 instead of serving data. Install/uninstall therefore
//     take effect immediately — no restart, no re-mount.
//   - the router: read the catalog, install, uninstall. Master-only.
//
// Uninstalling NEVER drops the module's tables or rows. A module is a lens on
// data the user owns; removing the lens must not destroy what it showed.
// Reinstalling restores the exact prior state. Wiping data is a separate,
// explicit act (and does not exist yet by design).
//
// Single-user core: there is no per-account install state here. The cloud layer
// runs one core per account, so "this instance's installed set" IS the user's.

import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import type { Database } from 'better-sqlite3'
import type { Access } from '../middleware/auth.ts'
import { CATALOG, catalogEntry } from './catalog.ts'

// authMiddleware attaches `access`; read it without re-typing the route's
// params generic (a cast to AccessRequest fights the Request<P> instantiation).
function accessOf(req: Request): Access | undefined {
  return (req as Request & { access?: Access }).access
}

export const schema = `
CREATE TABLE IF NOT EXISTS installed_modules (
  module_id    TEXT PRIMARY KEY,
  installed    INTEGER NOT NULL DEFAULT 0,
  version      TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  installed_by TEXT
);
`

interface ModuleRow {
  module_id: string
  installed: number
  version: string
  updated_at: string
  installed_by: string | null
}

// Read-through cache of the installed set. The gate runs on every request to a
// module route, and this process is the only writer, so a cache invalidated on
// mutation is exact — no staleness window.
let cache: Set<string> | null = null

/** Reconcile the table with the modules this build actually ships.
 *  - unknown module id (module dropped from the build) → row kept, ignored.
 *  - new module id → inserted with its `preinstalled` default.
 *  A fresh instance therefore boots with exactly the preinstalled set, and a
 *  build upgrade never silently installs or uninstalls anything. */
export function syncCatalog(db: Database): void {
  const now = new Date().toISOString()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO installed_modules (module_id, installed, version, updated_at)
    VALUES (?, ?, ?, ?)
  `)
  const bumpVersion = db.prepare(
    'UPDATE installed_modules SET version = ? WHERE module_id = ? AND version <> ?',
  )
  db.transaction(() => {
    for (const entry of CATALOG) {
      const { id, version } = entry.manifest
      insert.run(id, entry.preinstalled ? 1 : 0, version, now)
      bumpVersion.run(version, id, version)
    }
  })()
  cache = null
}

export function installedIds(db: Database): Set<string> {
  if (cache) return cache
  const rows = db
    .prepare('SELECT module_id FROM installed_modules WHERE installed = 1')
    .all() as Array<{ module_id: string }>
  cache = new Set(rows.map((r) => r.module_id))
  return cache
}

export function isInstalled(db: Database, moduleId: string): boolean {
  return installedIds(db).has(moduleId)
}

export type InstallResult =
  | { ok: true }
  | { ok: false; status: number; code: string; detail?: unknown }

export function installModule(db: Database, moduleId: string, by?: string): InstallResult {
  const entry = catalogEntry(moduleId)
  if (!entry) return { ok: false, status: 404, code: 'unknown_module' }
  if (isInstalled(db, moduleId)) return { ok: true }

  // A module cannot run without the modules it reads through. Surface the whole
  // missing set so the UI can offer "install these too" in one step.
  const installed = installedIds(db)
  const missing = entry.manifest.dependencies.filter((dep) => !installed.has(dep))
  if (missing.length > 0) {
    return { ok: false, status: 409, code: 'missing_dependencies', detail: missing }
  }

  db.prepare(
    'UPDATE installed_modules SET installed = 1, updated_at = ?, installed_by = ? WHERE module_id = ?',
  ).run(new Date().toISOString(), by ?? null, moduleId)
  cache = null
  return { ok: true }
}

export function uninstallModule(db: Database, moduleId: string): InstallResult {
  const entry = catalogEntry(moduleId)
  if (!entry) return { ok: false, status: 404, code: 'unknown_module' }
  if (!isInstalled(db, moduleId)) return { ok: true }

  const installed = installedIds(db)
  const dependents = CATALOG.filter(
    (e) => installed.has(e.manifest.id) && e.manifest.dependencies.includes(moduleId),
  ).map((e) => e.manifest.id)
  if (dependents.length > 0) {
    return { ok: false, status: 409, code: 'has_dependents', detail: dependents }
  }

  db.prepare(
    'UPDATE installed_modules SET installed = 0, updated_at = ?, installed_by = NULL WHERE module_id = ?',
  ).run(new Date().toISOString(), moduleId)
  cache = null
  return { ok: true }
}

/** Route gate. Wrap a module's mount so its API only answers while installed:
 *    app.use('/api/notes', requireInstalled(db, 'notes'), createNotesRouter(db))
 *  409 (not 404) so a client can tell "you removed this module" apart from
 *  "this orchester never had it" — the latter is a 404 from no route at all. */
export function requireInstalled(db: Database, moduleId: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (isInstalled(db, moduleId)) { next(); return }
    res.status(409).json({ error: 'module_not_installed', moduleId })
  }
}

export interface ModulesRouterOptions {
  /** Called after the installed set changes, so the platform can rebuild the
   *  ModuleRegistry. Kept as a callback rather than importing registry.ts here:
   *  registry.ts already reads this module, and the cycle would be real. */
  onChange?: () => void
}

export function createModulesRouter(db: Database, opts: ModulesRouterOptions = {}): Router {
  const router = Router()

  // Installing changes what this instance runs — owner-only, never a guest with
  // a scoped share token.
  router.use((req, res, next) => {
    if (accessOf(req)?.kind !== 'master') { res.status(403).json({ error: 'forbidden' }); return }
    next()
  })

  router.get('/', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM installed_modules')
      .all() as ModuleRow[]
    const byId = new Map(rows.map((r) => [r.module_id, r]))
    res.json({
      modules: CATALOG.map((entry) => {
        const row = byId.get(entry.manifest.id)
        return {
          id: entry.manifest.id,
          label: entry.label,
          description: entry.description,
          category: entry.category,
          version: entry.manifest.version,
          dependencies: entry.manifest.dependencies,
          platforms: entry.manifest.platforms,
          hasServer: entry.apiPrefixes.length > 0,
          preinstalled: entry.preinstalled,
          installed: row ? row.installed === 1 : entry.preinstalled,
          updatedAt: row?.updated_at ?? null,
        }
      }),
    })
  })

  router.post('/:moduleId/install', (req, res) => {
    const access = accessOf(req)
    const by = access?.kind === 'master' ? access.userId : undefined
    const result = installModule(db, req.params['moduleId']!, by)
    if (!result.ok) {
      res.status(result.status).json({ error: result.code, detail: result.detail })
      return
    }
    opts.onChange?.()
    res.json({ ok: true, moduleId: req.params['moduleId'], installed: true })
  })

  // POST (not DELETE): uninstall is reversible bookkeeping, not a deletion —
  // the module's data survives untouched.
  router.post('/:moduleId/uninstall', (req, res) => {
    const result = uninstallModule(db, req.params['moduleId']!)
    if (!result.ok) {
      res.status(result.status).json({ error: result.code, detail: result.detail })
      return
    }
    opts.onChange?.()
    res.json({ ok: true, moduleId: req.params['moduleId'], installed: false })
  })

  return router
}
