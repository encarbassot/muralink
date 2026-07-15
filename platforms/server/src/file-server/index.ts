// NAS file-server addon.
// Serves a user-chosen folder ("NAS storage") as part of the instance. Two ways
// to reach it, both reusing the file-routes helpers (listDir / serveFile):
//   1. Through the core API at /api/storage/*  (same-origin for the frontend).
//   2. As a standalone HTTP server on its own port (LAN / future P2P peer).
//
// Enable via instance config: { nas: { enabled: true, rootPath: '/path' } }
// or env: ELIO_NAS_ENABLED=true ELIO_NAS_ROOT=/path/to/share
//
// See docs/agents/features/nas-hosting-server/ENTRY.md for the P2P design.
// The tunnel handshake (P2P) is out of MVP scope — left as a hook.

import { createServer, type Server } from 'node:http'
import { mkdir, rm, rename, cp, writeFile } from 'node:fs/promises'
import { join, basename, dirname } from 'node:path'
import express, { Router, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import type { InstanceConfig } from '../config.ts'
import { listDir, serveFile, safePathWithin } from '../file-routes/index.ts'
import type { Access } from '../middleware/auth.ts'
import { roleAllows, type Op } from '../scoped-tokens/index.ts'

export interface NasConfig {
  enabled: boolean
  rootPath: string
  port?: number  // standalone server port; defaults to 3002
}

export interface NasSession {
  rootPath: string
  port: number
  running: boolean
  stop: () => Promise<void>
}

// Resolves NAS config from instance config + env overrides.
export function resolveNasConfig(instanceConfig: InstanceConfig): NasConfig | null {
  const enabled =
    process.env['ELIO_NAS_ENABLED'] === 'true' || instanceConfig.nas?.enabled === true
  if (!enabled) return null

  const rootPath = process.env['ELIO_NAS_ROOT'] ?? instanceConfig.nas?.rootPath ?? ''
  if (!rootPath) {
    console.warn('NAS enabled but no rootPath configured — skipping')
    return null
  }

  const port = process.env['ELIO_NAS_PORT'] ? Number(process.env['ELIO_NAS_PORT']) : undefined
  return { enabled: true, rootPath, port }
}

// Router exposing the NAS folder, confined to rootPath. Mount at /api/storage.
//   GET /list?path=    — directory listing (defaults to rootPath)
//   GET /serve?path=   — stream a file (range-aware)
//   GET /root          — the configured root path
//
// Access is set by authMiddleware: 'master' (the owner — full access, root =
// ownerRoot) or 'scoped' (a relayed guest — role-limited, root pinned to the
// share folder, which must lie inside ownerRoot). A request with no access
// (the standalone LAN server, which has no auth) is treated as master.
export function createStorageRouter(ownerRoot: string): Router {
  const router = Router()

  // Effective root for this request: the share folder for guests, ownerRoot
  // otherwise. Stashed on the request by the gate.
  const effRoot = (req: Request): string => (req as { effRoot?: string }).effRoot ?? ownerRoot

  // Per-route gate: resolves the effective root and enforces the role's ops.
  const gate = (op: Op) => (req: Request, res: Response, next: NextFunction): void => {
    const access = (req as { access?: Access }).access ?? { kind: 'master' as const }
    if (access.kind === 'master') {
      ;(req as { effRoot?: string }).effRoot = ownerRoot
      next()
      return
    }
    // Scoped guest — confine the share folder inside the owner's root, then gate.
    const shareRoot = safePathWithin(ownerRoot, access.rootPath)
    if (!shareRoot) { res.status(403).json({ error: 'share outside root' }); return }
    if (!roleAllows(access.role, op)) { res.status(403).json({ error: 'forbidden for role' }); return }
    ;(req as { effRoot?: string }).effRoot = shareRoot
    next()
  }

  router.get('/root', gate('read'), (req: Request, res: Response) => {
    res.json({ root: effRoot(req) })
  })

  router.get('/list', gate('read'), async (req: Request, res: Response) => {
    const root = effRoot(req)
    const raw = typeof req.query['path'] === 'string' ? req.query['path'] : root
    const dir = safePathWithin(root, raw)
    if (!dir) { res.status(403).json({ error: 'forbidden' }); return }
    try {
      res.json({ root, path: dir, entries: await listDir(dir) })
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  router.get('/serve', gate('read'), (req: Request, res: Response) => {
    const root = effRoot(req)
    const raw = typeof req.query['path'] === 'string' ? req.query['path'] : null
    if (!raw) { res.status(400).json({ error: 'missing path' }); return }
    const abs = safePathWithin(root, raw)
    if (!abs) { res.status(403).json({ error: 'forbidden' }); return }
    serveFile(abs, req, res)
  })

  // ── Write operations (all confined to the effective root) ────────────────

  // Upload: raw body bytes written to <dir>/<name>. Client posts the File with
  // Content-Type application/octet-stream so the global json parser skips it.
  router.post('/upload', gate('write'), express.raw({ type: () => true, limit: '2gb' }), async (req: Request, res: Response) => {
    const root = effRoot(req)
    const dirRaw = typeof req.query['dir'] === 'string' ? req.query['dir'] : root
    const name = typeof req.query['name'] === 'string' ? req.query['name'] : ''
    const dir = safePathWithin(root, dirRaw)
    if (!dir || !name) { res.status(400).json({ error: 'missing dir/name' }); return }
    const dest = safePathWithin(root, join(dir, basename(name)))
    if (!dest) { res.status(403).json({ error: 'forbidden' }); return }
    try {
      await writeFile(dest, req.body as Buffer)
      res.json({ ok: true, path: dest })
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  router.post('/mkdir', gate('write'), async (req: Request, res: Response) => {
    const root = effRoot(req)
    const dir = safePathWithin(root, String((req.body as { path?: string }).path ?? ''))
    if (!dir) { res.status(403).json({ error: 'forbidden' }); return }
    try { await mkdir(dir, { recursive: true }); res.json({ ok: true }) }
    catch (e) { res.status(500).json({ error: String(e) }) }
  })

  router.post('/delete', gate('delete'), async (req: Request, res: Response) => {
    const root = effRoot(req)
    const target = safePathWithin(root, String((req.body as { path?: string }).path ?? ''))
    if (!target || target === root) { res.status(403).json({ error: 'forbidden' }); return }
    try { await rm(target, { recursive: true, force: true }); res.json({ ok: true }) }
    catch (e) { res.status(500).json({ error: String(e) }) }
  })

  router.post('/move', gate('write'), async (req: Request, res: Response) => {
    const root = effRoot(req)
    const { from, to } = req.body as { from?: string; to?: string }
    const src = safePathWithin(root, String(from ?? ''))
    const dst = safePathWithin(root, String(to ?? ''))
    if (!src || !dst || src === root) { res.status(403).json({ error: 'forbidden' }); return }
    try { await mkdir(dirname(dst), { recursive: true }); await rename(src, dst); res.json({ ok: true }) }
    catch (e) { res.status(500).json({ error: String(e) }) }
  })

  router.post('/copy', gate('write'), async (req: Request, res: Response) => {
    const root = effRoot(req)
    const { from, to } = req.body as { from?: string; to?: string }
    const src = safePathWithin(root, String(from ?? ''))
    const dst = safePathWithin(root, String(to ?? ''))
    if (!src || !dst) { res.status(403).json({ error: 'forbidden' }); return }
    try { await cp(src, dst, { recursive: true }); res.json({ ok: true }) }
    catch (e) { res.status(500).json({ error: String(e) }) }
  })

  return router
}

// Standalone NAS server on its own port (binds 0.0.0.0 for LAN). Optional —
// the core already exposes the same folder at /api/storage.
export async function startFileServer(config: NasConfig): Promise<NasSession> {
  const port = config.port ?? 3002
  const app = express()
  app.use(cors({ origin: '*' }))
  app.use('/', createStorageRouter(config.rootPath))

  const server: Server = await new Promise((resolve, reject) => {
    const s = createServer(app)
    s.on('error', reject)
    s.listen(port, '0.0.0.0', () => resolve(s))
  })
  console.log(`[file-server] NAS serving ${config.rootPath} on http://0.0.0.0:${port}`)

  return {
    rootPath: config.rootPath,
    port,
    running: true,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

export async function stopFileServer(session: NasSession): Promise<void> {
  await session.stop()
}
