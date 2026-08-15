import type { Request, Response, NextFunction } from 'express'
import { scopedTokens, type Role } from '../scoped-tokens/index.ts'
import { getEntitlement, type Entitlement } from '../entitlement/index.ts'

const TOKEN = process.env['ELIO_API_TOKEN'] ?? 'dev-token'

// Per-request identity, resolved from the bearer/query token.
//   master — the instance owner: full access to everything. `userId` is the
//   `who` for the operation (X-Mural-User → createdBy). In a single-user
//   instance the owner is implicit and this is absent. In a shared-workspace
//   enterprise instance it carries the AUTHENTICATED user id injected by the
//   multi-user front (@muralink/multiuser), which verified the session and
//   stripped any browser-supplied value first. The core trusts it because only
//   the front (holding the master token) can reach the core — browsers go
//   through the front. `entitlement` is what this instance is licensed for —
//   observe-only here; feature/multi-user gates read it downstream.
//   scoped — a relayed guest: a role over a single shared folder.
export type Access =
  | { kind: 'master'; userId?: string; entitlement: Entitlement & { valid: boolean } }
  | { kind: 'scoped'; shareId: string; rootPath: string; role: Role; muralId?: string; contactLocations?: boolean; viewerEmail?: string }

export interface AccessRequest extends Request {
  access: Access
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Public endpoints bypass auth
  if (req.path === '/health') { next(); return }
  // Google OAuth handshake: the browser reaches these without a bearer token;
  // they are guarded by a random `state` (CSRF) instead.
  if (req.path === '/api/calendar/google/auth' || req.path === '/api/calendar/google/callback') {
    next(); return
  }
  if (req.path === '/api/appointments/appointments/public' && req.method === 'POST') {
    next(); return
  }
  if (req.path.startsWith('/api/appointments/slots') && req.method === 'GET') {
    next(); return
  }
  if (req.path.startsWith('/api/appointments/services') && req.method === 'GET') {
    next(); return
  }
  // Public guest payment flow: a customer paying via a booking/rental link has
  // no bearer token. Creating a charge/hold and polling its status are public;
  // capture/void/refund stay authed (only the instance owner releases a hold).
  // (The Stripe webhook is mounted before this middleware — no entry needed.)
  if ((req.path === '/api/payments/checkout' || req.path === '/api/payments/authorize') && req.method === 'POST') {
    next(); return
  }
  if (req.path.startsWith('/api/payments/checkout/') && req.method === 'GET') {
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
    ;(req as AccessRequest).access = {
      kind: 'master',
      userId: userId || undefined,
      entitlement: getEntitlement(),
    }
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
      muralId: grant.muralId,
      contactLocations: grant.contactLocations,
      viewerEmail: grant.viewerEmail,
    }
    next()
    return
  }

  res.status(401).json({ error: 'unauthorized' })
}

// Same rule as authMiddleware, for callers that hold a token but no request:
// the websocket upgrade handshake, which happens before Express sees anything.
export function isValidToken(token: string | undefined): boolean {
  if (!token) return false
  if (token === TOKEN) return true
  return scopedTokens.resolve(token) !== null
}
