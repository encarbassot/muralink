// The enterprise multi-user front — shared-workspace model.
//
// The paid capability is NOT a locked button. It is the ability of the SYNC
// PROTOCOL to carry an authenticated identity (`who`) for every operation, so
// several people can edit the SAME workspace with real authorship, permissions
// and history. A single-user Orchester never needs a `who` — its owner is
// implicit. The moment two people share one workspace, every write must say who
// made it. That `who` is the product.
//
// This front is where `who` becomes trustworthy. In single-user land the core's
// `X-Mural-User` header is attribution only (trusted, unauthenticated). Here we
// replace that trust with proof: the front authenticates each user (login →
// verified session), then forwards their request to the ONE shared core with an
// injected, verified `X-Mural-User`. The browser holds only its front session —
// never the core's master token, and it can never set its own `who` (inbound
// X-Mural-User is stripped before we inject the verified one).
//
//   entitlement.multiuser !== true  → SINGLE mode: transparent pass-through to
//     the single core. No per-user login; the owner is the implicit `who`.
//     Single-user features are NEVER blocked, online or offline.
//   entitlement.multiuser === true  → MULTIUSER mode: per-user login, and every
//     /api request reaches the shared core stamped with a verified `who`.
//
// Honest positioning: a client can fork the open code and stand up local
// multi-user offline — that is theirs, local-first. But the real product is the
// server-side coordination: at cloud-sync time our master API authorizes each
// `who` against the Orchester's provisioned seats (who→seat — Phase-2). An
// unauthorized `who` has nothing to bind to, so it does not sync. That gate is
// structural (the protocol needs a real `who`), not a lock you promised not to
// remove. See platforms/server/src/entitlement for the entitlement itself.
//
// The mode is fixed for the process lifetime (the entitlement is process-cached,
// like a cloud core's injected token). Flipping a plan takes effect on restart.
//
// Proxying uses raw node:http (streams request bodies untouched) so the open
// core needs no proxy dependency — same approach as orchester/frontend-server.

import express, { type Express, type Request, type Response } from 'express'
import * as http from 'node:http'
import * as https from 'node:https'
import { getEntitlement } from '@muralink/platform-server/entitlement'
import { UserStore } from './users.ts'
import { verifyClientToken, type ClientTokenConfig } from './verifiers/clientToken.ts'

export interface MultiuserFrontOptions {
  usersDbPath: string
  // Origin of the single shared core (the Orchester).
  coreOrigin?: string
  // The core's master token (ELIO_API_TOKEN). In MULTIUSER mode the front holds
  // it and injects it per request so the browser never does.
  coreToken?: string
  // Called when a local user is created, to enroll them as a seat on the master
  // API (who→seat). Best-effort and offline-safe — the local seat cap still
  // applies without it; the seat just becomes authorized for CLOUD sync once the
  // enrollment lands. Provided by main.ts using the account link.
  enrollSeat?: (who: string, label?: string) => void | Promise<void>
  // Resolves the cloud master origin + account session token for /collab sync
  // forwarding. Read fresh per request (a link may appear after boot). null =
  // not linked → /collab returns 503. The browser thus never holds the account
  // token: it hits the front with its own session, the front injects the account
  // token + the verified `who`.
  masterLink?: () => { origin: string; accountToken: string } | null
  // Verifies the CLIENT's own login token (Rails/Devise, an internal SSO…)
  // for POST /auth/federated — see verifiers/clientToken.ts. Absent = that
  // route answers 501; a client that only wants email/password signup/login
  // never needs to set this.
  clientTokenConfig?: ClientTokenConfig
}

export interface MultiuserFront {
  app: Express
  mode: 'multiuser' | 'single'
}

// The header the core reads as the operation's author. Authenticated here.
const WHO_HEADER = 'x-mural-user'

function bearer(req: Request): string | null {
  const header = req.headers['authorization']
  if (header?.startsWith('Bearer ')) return header.slice(7)
  if (typeof req.query['token'] === 'string') return req.query['token']
  return null
}

// Stream `req` to the core and pipe its response back.
//   auth === undefined → transparent pass-through (SINGLE mode): headers as-is.
//   auth provided      → authenticated (MULTIUSER): strip any inbound
//     Authorization / ?token= / `who` the browser may have set, then inject the
//     master token + the VERIFIED who. This is what makes `who` trustworthy.
function proxyToCore(
  req: Request,
  res: Response,
  target: { hostname: string; port: number },
  auth?: { masterToken: string; who: string },
): void {
  const path = (req.originalUrl || req.url).replace(/([?&])token=[^&]*/g, '$1').replace(/[?&]$/, '')
  const headers: http.OutgoingHttpHeaders = { ...req.headers, host: `${target.hostname}:${target.port}` }
  if (auth) {
    headers['authorization'] = `Bearer ${auth.masterToken}`
    headers[WHO_HEADER] = auth.who // verified — overrides anything the browser sent
  }

  const upstream = http.request(
    { hostname: target.hostname, port: target.port, path, method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    },
  )
  upstream.on('error', () => {
    if (!res.headersSent) res.status(502).json({ error: 'core unavailable' })
    else res.end()
  })
  req.pipe(upstream)
}

// Stream `req` to a REMOTE origin (the cloud master), overriding auth headers.
// Used for /collab forwarding: the browser authenticates to the front with its
// session; the front swaps in the account token + verified `who` and forwards to
// the master. Supports http + https targets.
function proxyToRemote(
  req: Request,
  res: Response,
  targetUrl: string,
  override: { authorization: string; who: string },
): void {
  const t = new URL(targetUrl)
  const mod = t.protocol === 'https:' ? https : http
  const headers: http.OutgoingHttpHeaders = {
    ...req.headers,
    host: t.host,
    authorization: override.authorization,
    [WHO_HEADER]: override.who, // verified — overrides anything inbound
  }
  const upstream = mod.request(
    {
      hostname: t.hostname,
      port: t.port || (t.protocol === 'https:' ? 443 : 80),
      path: t.pathname + t.search,
      method: req.method,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    },
  )
  upstream.on('error', () => {
    if (!res.headersSent) res.status(502).json({ error: 'cloud unreachable' })
    else res.end()
  })
  req.pipe(upstream)
}

export function createMultiuserFront(opts: MultiuserFrontOptions): MultiuserFront {
  const ent = getEntitlement()
  const app = express()
  const url = new URL(opts.coreOrigin ?? 'http://127.0.0.1:3001')
  const target = { hostname: url.hostname, port: Number(url.port || 80) }

  // ── THE GATE ────────────────────────────────────────────────────────────
  if (ent.multiuser !== true) {
    // SINGLE mode. Transparent pass-through; the browser authenticates to the
    // core exactly as a free self-host does. No per-user identity is introduced.
    app.use('/api', (req, res) => proxyToCore(req, res, target))
    app.use('/auth', express.json(), (_req, res) => {
      res.status(403).json({ error: 'multi-user requires an enterprise entitlement', plan: ent.plan })
    })
    return { app, mode: 'single' }
  }

  // ── MULTIUSER mode (shared workspace) ───────────────────────────────────────
  const masterToken = opts.coreToken ?? process.env['ELIO_API_TOKEN'] ?? 'dev-token'
  const users = new UserStore(opts.usersDbPath)

  // /api → the shared core, stamped with the verified `who`. Mounted before any
  // body parser so uploads stream through untouched.
  app.use('/api', (req: Request, res: Response): void => {
    const token = bearer(req)
    const userId = token ? users.verifySession(token) : null
    if (!userId) {
      res.status(401).json({ error: 'invalid or missing session' })
      return
    }
    proxyToCore(req, res, target, { masterToken, who: userId })
  })

  // /collab → the cloud master's shared-workspace sync surface, stamped with the
  // verified `who`. The browser holds only its front session; the front injects
  // the account token + who, and the master gates who→seat. Not linked → 503.
  app.use('/collab', (req: Request, res: Response): void => {
    const token = bearer(req)
    const userId = token ? users.verifySession(token) : null
    if (!userId) {
      res.status(401).json({ error: 'invalid or missing session' })
      return
    }
    const link = opts.masterLink?.()
    if (!link) {
      res.status(503).json({ error: 'instance not linked to cloud' })
      return
    }
    proxyToRemote(req, res, `${link.origin.replace(/\/$/, '')}/collab${req.url}`, {
      authorization: `Bearer ${link.accountToken}`,
      who: userId,
    })
  })

  // Auth routes, with their own body parser (mounted after the streaming proxy).
  const auth = express.Router()
  auth.use(express.json())

  auth.post('/signup', (req, res): void => {
    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown }
    if (typeof email !== 'string' || typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'email and 8+ char password required' })
      return
    }
    // Seat cap: reject signups beyond the entitlement's seat count. (The cloud
    // who→seat authorization at sync time is the structural enforcement; this is
    // the local convenience limit.)
    if (users.count() >= ent.seats) {
      res.status(403).json({ error: `seat limit reached (${ent.seats})` })
      return
    }
    try {
      const user = users.signup(email, password)
      const session = users.login(email, password)!
      // Enroll as a cloud seat (who→seat). Best-effort — never blocks signup;
      // offline just defers cloud authorization until it lands.
      void Promise.resolve(opts.enrollSeat?.(user.id, user.email)).catch(() => {})
      res.status(201).json({ token: session.token, user })
    } catch {
      res.status(409).json({ error: 'email already registered' })
    }
  })

  // Federated login: the browser already holds a session token from the
  // client's OWN auth backend (e.g. Rails/Devise). We verify it server-side
  // (never trust a claimed identity from the browser alone), then find-or-
  // create a Mural user and mint a session — same response shape as /login,
  // so bearer()/verifySession()/proxyToCore need no federated-specific code.
  auth.post('/federated', async (req, res): Promise<void> => {
    if (!opts.clientTokenConfig) {
      res.status(501).json({ error: 'federated login not configured' })
      return
    }
    const { clientToken } = (req.body ?? {}) as { clientToken?: unknown }
    if (typeof clientToken !== 'string' || !clientToken) {
      res.status(400).json({ error: 'clientToken required' })
      return
    }
    const identity = await verifyClientToken(opts.clientTokenConfig, clientToken)
    if (!identity) {
      res.status(401).json({ error: 'invalid client token' })
      return
    }
    // Seat cap applies to NEW federated users only — an already-provisioned
    // one keeps logging in even if the account is momentarily over its cap.
    if (!users.findByExternalId(identity.externalId) && users.count() >= ent.seats) {
      res.status(403).json({ error: `seat limit reached (${ent.seats})` })
      return
    }
    const session = users.upsertFederated(identity.externalId, identity.email)
    // Best-effort cloud seat enrollment — never blocks the login.
    void Promise.resolve(opts.enrollSeat?.(session.user.id, identity.email ?? identity.name)).catch(() => {})
    res.json({ token: session.token, user: session.user })
  })

  auth.post('/login', (req, res): void => {
    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown }
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'email and password required' })
      return
    }
    const session = users.login(email, password)
    if (!session) {
      res.status(401).json({ error: 'invalid credentials' })
      return
    }
    res.json({ token: session.token, user: session.user })
  })

  auth.post('/logout', (req, res): void => {
    const token = bearer(req)
    if (token) users.logout(token)
    res.json({ ok: true })
  })

  auth.get('/me', (req, res): void => {
    const token = bearer(req)
    const userId = token ? users.verifySession(token) : null
    if (!userId) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    res.json({ userId, seats: ent.seats, plan: ent.plan })
  })

  app.use('/auth', auth)

  return { app, mode: 'multiuser' }
}
