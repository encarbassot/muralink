import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDb } from './db.ts'
import { getRegistry } from './registry.ts'
import { authMiddleware } from './middleware/auth.ts'
import { loadInstanceConfig } from './config.ts'
import { resolveNasConfig, startFileServer, createStorageRouter } from './file-server/index.ts'
import { createScopedShareRouter } from './scoped-tokens/index.ts'
import { createPresenceRouter, presenceService } from './presence/index.ts'
import { createFileRouter } from './file-routes/index.ts'
import { createCalendarRouter } from '@muralink/module-calendar/server'
import { createContactsRouter } from '@muralink/module-contacts/server'
import { createNotesRouter } from '@muralink/module-notes/server'
import { createRemindersRouter } from '@muralink/module-reminders/server'
import { createAppointmentsRouter } from '@muralink/module-appointments/server'
import { createStockRouter } from '@muralink/module-stock/server'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env['PORT'] ?? 3001)

const instanceConfig = loadInstanceConfig()

// Ensure data dir exists
const dataDir = path.join(__dirname, '../../data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

// Init DB and registry
const db = getDb()
const registry = getRegistry()
console.log(`ModuleRegistry: ${registry.all().map(m => m.id).join(', ')}`)

// Working hours from instance config
const [startH, startM] = instanceConfig.workingHours.start.split(':').map(Number) as [number, number]
const [endH, endM] = instanceConfig.workingHours.end.split(':').map(Number) as [number, number]
const workingHours = {
  startHour: startH,
  startMinute: startM,
  endHour: endH,
  endMinute: endM,
  slotMinutes: instanceConfig.slotDurationMinutes,
  workingDays: instanceConfig.workingHours.days,
}

const app = express()

// Same-origin deployments (nginx proxying /elio/api → here) need no CORS at
// all; cross-origin ones should pin the allowed origin instead of '*'.
const corsOrigin = process.env['ELIO_CORS_ORIGIN']
app.use(cors(corsOrigin ? { origin: corsOrigin.split(',') } : undefined))
app.use(express.json())

// Presence is anonymous (the injected web script has no token) — mount before auth.
app.use('/api/__presence', createPresenceRouter())

app.use(authMiddleware)

app.use('/api/files', createFileRouter())

// NAS storage — the user-chosen folder this instance hosts (same-origin so the
// dock's storage section reads it directly).
const nasConfig = resolveNasConfig(instanceConfig)
if (nasConfig) {
  app.use('/api/storage', createStorageRouter(nasConfig.rootPath))
  // Per-share scoped-token mint/revoke (master-only) — used by the orchester
  // tunnel-agent to credential an external folder share. See folder-share-relay.md.
  app.use('/api/shares', createScopedShareRouter(nasConfig.rootPath))
  console.log(`NAS storage mounted at /api/storage (root: ${nasConfig.rootPath})`)
}

app.use('/api/calendar', createCalendarRouter(db))
app.use('/api/contacts', createContactsRouter(db))
app.use('/api/notes', createNotesRouter(db))
app.use('/api/reminders', createRemindersRouter(db))
app.use('/api/appointments', createAppointmentsRouter(db, workingHours))
app.use('/api/stock', createStockRouter(db))

app.get('/health', (_req, res) => {
  res.json({ ok: true, instance: instanceConfig.id, modules: registry.all().map(m => m.id) })
})

app.listen(PORT, () => {
  console.log(`${instanceConfig.name} server running on http://localhost:${PORT}`)
  presenceService.start()
  // Tunnel registration is NOT done here. Registering an instance needs a user
  // SESSION token (POST /instances/register is user-authed) — an env var cannot
  // provide that. Registration + the outbound agent link are owned by the
  // orchester account link (packages/orchester/src/account.ts, ~/.elio/account.json),
  // which the user drives by logging in to their Tunnel account. Anonymous-first:
  // with no account linked the server just runs standalone.

  // Optional standalone LAN server on its own port (P2P/LAN peers).
  if (nasConfig && process.env['ELIO_NAS_STANDALONE'] === 'true') void startFileServer(nasConfig)
})
