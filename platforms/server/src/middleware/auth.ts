import type { Request, Response, NextFunction } from 'express'
import { scopedTokens, type Role } from '../scoped-tokens/index.ts'

const TOKEN = process.env['ELIO_API_TOKEN'] ?? 'dev-token'

// Per-request identity, resolved from the bearer/query token.
//   master — the instance owner: full access to everything. `userId` is the
//   optional X-Mural-User header for attribution (createdBy) when several
//   people share the master token — trusted, not authenticated (MVP; per-user
//   tokens are the follow-up).
//   scoped — a relayed guest: a role over a single shared folder.
export type Access =
  | { kind: 'master'; userId?: string }
  | { kind: 'scoped'; shareId: string; rootPath: string; role: Role }

export interface AccessRequest extends Request {
  access: Access
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Public endpoints bypass auth
  if (req.path === '/health') { next(); return }
  if (req.path === '/api/appointments/appointments/public' && req.method === 'POST') {
    next(); return
  }
  if (req.path.startsWith('/api/appointments/slots') && req.method === 'GET') {
    next(); return
  }
  if (req.path.startsWith('/api/appointments/services') && req.method === 'GET') {
    next(); return
  }

  const header = req.headers['authorization'] ?? ''
  const headerToken = header.startsWith('Bearer ') ? header.slice(7) : ''
  // Browser GETs (open in new tab, <img src>, downloads) can't send an
  // Authorization header — accept the token via ?token= for those too.
  const queryToken = typeof req.query['token'] === 'string' ? req.query['token'] : ''
  const presented = headerToken || queryToken

  if (presented === TOKEN) {
    const userId = req.header('x-mural-user')
    ;(req as AccessRequest).access = { kind: 'master', userId: userId || undefined }
    next()
    return
  }

  // Not the master token — try a scoped (per-share) grant. Scoped tokens reach
  // only the storage routes; the role gate there enforces what each may do.
  const grant = presented ? scopedTokens.resolve(presented) : null
  if (grant) {
    ;(req as AccessRequest).access = {
      kind: 'scoped',
      shareId: grant.shareId,
      rootPath: grant.rootPath,
      role: grant.role,
    }
    next()
    return
  }

  res.status(401).json({ error: 'unauthorized' })
}
