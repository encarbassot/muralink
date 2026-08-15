// HTTP surface for Google sync, mounted at /api/calendar/google.
//   GET  /auth       → redirect the browser to Google's consent screen (public)
//   GET  /callback   → OAuth redirect target; exchanges the code (public)
//   GET  /status     → connection state (master token)
//   POST /sync       → force a sync cycle now (master token)
//   POST /disconnect → drop tokens + mapping (master token)
//
// /auth and /callback are public because the browser reaches them without a
// bearer token; they are protected by a random `state` (CSRF) instead. The
// orchester adds both to the auth-middleware bypass list.

import { randomBytes } from 'crypto'
import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import type { GoogleConfig } from './config.ts'
import { buildAuthUrl, exchangeCode } from './oauth.ts'
import { clearAccount, getAccount, getSyncToken } from './store.ts'
import { syncOnce } from './sync.ts'

export function createGoogleRouter(db: Database, cfg: GoogleConfig): Router {
  const router = Router()
  const pendingStates = new Set<string>()

  router.get('/auth', (_req, res) => {
    const state = randomBytes(16).toString('hex')
    pendingStates.add(state)
    res.redirect(buildAuthUrl(cfg, state))
  })

  router.get('/callback', (req, res) => {
    const code = String(req.query['code'] ?? '')
    const state = String(req.query['state'] ?? '')
    if (!code || !pendingStates.has(state)) {
      res.status(400).send('Estado OAuth inválido o código ausente. Reinicia la conexión.')
      return
    }
    pendingStates.delete(state)
    exchangeCode(db, cfg, code)
      .then(() => syncOnce(db, cfg).catch(() => undefined)) // seed first sync
      .then(() => {
        res.send(
          '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:2rem">' +
            '<h2>Google Calendar conectado ✅</h2><p>Ya puedes cerrar esta pestaña.</p></body>',
        )
      })
      .catch((err: Error) => {
        res.status(500).send(`No se pudo conectar: ${err.message}`)
      })
  })

  router.get('/status', (_req, res) => {
    const account = getAccount(db)
    res.json({
      connected: Boolean(account),
      email: account?.email,
      calendarId: cfg.calendarId,
      hasSyncToken: Boolean(getSyncToken(db, cfg.calendarId)),
    })
  })

  router.post('/sync', (_req, res) => {
    syncOnce(db, cfg)
      .then((result) => res.json(result))
      .catch((err: Error) => res.status(500).json({ error: err.message }))
  })

  router.post('/disconnect', (_req, res) => {
    clearAccount(db)
    res.json({ connected: false })
  })

  return router
}
