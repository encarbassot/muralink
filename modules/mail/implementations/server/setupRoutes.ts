// REST surface for the local-mailbox wizard. Mounted at /api/mail/setup.
//
// Deliberately reachable *before* mail is enabled — the whole point is to get
// from "nothing configured" to "daemon armed", so gating it on the daemon
// being up would be circular.

import express from 'express'
import type Database from 'better-sqlite3'
import {
  dnsRecords,
  envSnippet,
  getSetup,
  portRequirements,
  saveSetup,
  setEnabled,
  validateSetupInput,
  verifyDns,
  verifyPorts,
} from './setup.ts'

export function createMailSetupRouter(db: Database.Database) {
  const router = express.Router()

  // Everything the wizard needs to render any of its steps in one call.
  router.get('/status', (_req, res) => {
    const setup = getSetup(db)
    res.json({
      setup,
      dns: setup.configured ? dnsRecords(setup) : [],
      ports: portRequirements(setup),
      env: setup.configured ? envSnippet(setup) : '',
    })
  })

  // Create or update the mailbox. Generates the DKIM keypair on first call.
  router.post('/', (req, res) => {
    const { domain, mailbox, publicIp, smtpPort, submissionPort, dkimSelector, tlsEmail } = req.body ?? {}
    const invalid = validateSetupInput({ domain, mailbox })
    if (invalid) return res.status(400).json({ error: invalid })

    try {
      const setup = saveSetup(db, {
        domain,
        mailbox,
        publicIp,
        smtpPort: smtpPort ? Number(smtpPort) : undefined,
        submissionPort: submissionPort ? Number(submissionPort) : undefined,
        dkimSelector,
        tlsEmail,
      })
      res.json({ setup, dns: dnsRecords(setup), ports: portRequirements(setup), env: envSnippet(setup) })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'save_failed' })
    }
  })

  router.get('/dns', (_req, res) => {
    const setup = getSetup(db)
    if (!setup.configured) return res.status(409).json({ error: 'mail_not_configured' })
    res.json(dnsRecords(setup))
  })

  router.get('/ports', (_req, res) => {
    res.json(portRequirements(getSetup(db)))
  })

  router.post('/verify', async (_req, res) => {
    const setup = getSetup(db)
    if (!setup.configured) return res.status(409).json({ error: 'mail_not_configured' })
    try {
      const [dns, ports] = await Promise.all([verifyDns(setup), verifyPorts(setup)])
      res.json({ dns, ports, checkedAt: new Date().toISOString() })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'verify_failed' })
    }
  })

  // Optional network path, never automatic: asks a public echo service what IP
  // the world sees. Offline or blocked → the user types the IP by hand.
  router.post('/detect-ip', async (_req, res) => {
    try {
      const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(4000) })
      if (!r.ok) throw new Error(`http_${r.status}`)
      const { ip } = (await r.json()) as { ip: string }
      res.json({ ip })
    } catch (err) {
      res.status(503).json({ error: 'detect_failed', detail: err instanceof Error ? err.message : String(err) })
    }
  })

  // Arming the daemon. The listeners themselves come up on the next daemon
  // start, so the response says plainly that a restart is pending.
  router.post('/enable', (req, res) => {
    const enabled = req.body?.enabled !== false
    try {
      const setup = setEnabled(db, enabled)
      res.json({ setup, restartRequired: true, env: envSnippet(setup) })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'enable_failed'
      res.status(msg === 'mail_not_configured' ? 409 : 500).json({ error: msg })
    }
  })

  return router
}
