// Scoped tokens — per-share credentials minted by the host (orchester
// tunnel-agent, Phase 2) and enforced here in the core. A scoped token grants a
// guest a *role* over a *single folder*, distinct from the master token which
// has full access to everything.
//
// The token string never reaches the guest browser: it lives between the
// Tunnel relay and this core. The core is the final authority on what a role
// may do — see tunnel/docs/folder-share-relay.md.

export type Role = 'viewer' | 'editor' | 'admin'

// Coarse operation classes mapped onto the storage routes.
export type Op = 'read' | 'write' | 'delete'

const ROLE_OPS: Record<Role, ReadonlySet<Op>> = {
  viewer: new Set<Op>(['read']),
  editor: new Set<Op>(['read', 'write']),
  admin: new Set<Op>(['read', 'write', 'delete']),
}

export function roleAllows(role: Role, op: Op): boolean {
  return ROLE_OPS[role]?.has(op) ?? false
}

export function isRole(v: unknown): v is Role {
  return v === 'viewer' || v === 'editor' || v === 'admin'
}

export interface ScopedGrant {
  token: string
  shareId: string
  rootPath: string
  role: Role
  // ISO string, or null for no expiry.
  expiresAt: string | null
}

// In-memory store. Shares are ephemeral by nature (the agent re-registers on
// reconnect), so persistence is intentionally not required here.
export class ScopedTokenStore {
  #byToken = new Map<string, ScopedGrant>()

  mint(grant: ScopedGrant): void {
    this.#byToken.set(grant.token, grant)
  }

  // Resolve a token to a live grant, or null if unknown/expired.
  resolve(token: string): ScopedGrant | null {
    const grant = this.#byToken.get(token)
    if (!grant) return null
    if (grant.expiresAt && new Date(grant.expiresAt) < new Date()) {
      this.#byToken.delete(token)
      return null
    }
    return grant
  }

  revoke(token: string): void {
    this.#byToken.delete(token)
  }

  revokeShare(shareId: string): void {
    for (const [token, g] of this.#byToken) {
      if (g.shareId === shareId) this.#byToken.delete(token)
    }
  }

  list(): Omit<ScopedGrant, 'token'>[] {
    return Array.from(this.#byToken.values()).map(({ token: _t, ...rest }) => rest)
  }
}

// Single process-wide store, shared by the auth middleware (resolves tokens)
// and the orchester agent (mints them).
export const scopedTokens = new ScopedTokenStore()

// ── Host-side mint/revoke API ────────────────────────────────────────────────
// Master-only routes the orchester tunnel-agent (Phase 2) calls to create a
// per-share credential before registering the share with the Tunnel. Mounted at
// /api/shares. Share folders are confined inside the owner's served root.

import { Router, type Request, type Response } from 'express'
import { randomUUID, randomBytes } from 'node:crypto'
import { safePathWithin } from '../file-routes/index.ts'
import type { Access } from '../middleware/auth.ts'

export function createScopedShareRouter(ownerRoot: string): Router {
  const router = Router()

  // Only the instance owner may mint/revoke share credentials.
  router.use((req: Request, res: Response, next): void => {
    const access = (req as { access?: Access }).access
    if (access?.kind !== 'master') { res.status(403).json({ error: 'master only' }); return }
    next()
  })

  // POST /  { rootPath, role, expiresAt? } → { shareId, token, rootPath, role }
  router.post('/', (req: Request, res: Response): void => {
    const { rootPath, role, expiresAt } = req.body as {
      rootPath?: unknown; role?: unknown; expiresAt?: unknown
    }
    if (typeof rootPath !== 'string' || !rootPath) { res.status(400).json({ error: 'rootPath required' }); return }
    if (!isRole(role)) { res.status(400).json({ error: 'role must be viewer|editor|admin' }); return }

    const within = safePathWithin(ownerRoot, rootPath)
    if (!within) { res.status(403).json({ error: 'rootPath outside owner root' }); return }

    const shareId = randomUUID()
    const token = randomBytes(32).toString('hex')
    scopedTokens.mint({
      token,
      shareId,
      rootPath: within,
      role,
      expiresAt: typeof expiresAt === 'string' ? expiresAt : null,
    })
    res.status(201).json({ shareId, token, rootPath: within, role })
  })

  router.get('/', (_req: Request, res: Response): void => {
    res.json({ shares: scopedTokens.list() })
  })

  // DELETE /:shareId — revoke every token for the share.
  router.delete('/:shareId', (req: Request, res: Response): void => {
    scopedTokens.revokeShare(req.params['shareId'] ?? '')
    res.json({ ok: true })
  })

  return router
}
