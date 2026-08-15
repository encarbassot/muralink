import express from 'express'
import cors from 'cors'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDb } from './db.ts'
import { getRegistry, rebuildRegistry } from './registry.ts'
import { createModulesRouter, requireInstalled, syncCatalog } from './modules/index.ts'
import { authMiddleware, isValidToken } from './middleware/auth.ts'
import { loadInstanceConfig } from './config.ts'
import { resolveNasConfig, startFileServer, createStorageRouter, createNasQuota } from './file-server/index.ts'
import { createScopedShareRouter } from './scoped-tokens/index.ts'
import { createPresenceRouter, presenceService } from './presence/index.ts'
import { createFileRouter } from './file-routes/index.ts'
import { createVaultLayoutsRouter } from './vault-layouts/index.ts'
import { createRelationsRouter, createRelationTypesRouter } from './relations/index.ts'
import { createPaymentsRouter, buildPaymentRegistry } from './payments/index.ts'
import { createPaymentsWebhookHandler } from './payments/webhook.ts'
import { createAiRouter, buildAiRegistry } from './ai/index.ts'
import {
  createCalendarRouter,
  googleConfig,
  initGoogleSchema,
  createGoogleRouter,
  startGoogleSync,
  googleWriteHooks,
} from '@muralink/module-calendar/server'
import { createContactsRouter } from '@muralink/module-contacts/server'
import { createNotesRouter } from '@muralink/module-notes/server'
import { createMuralesRouter } from '@muralink/module-murales/server'
import { createRemindersRouter } from '@muralink/module-reminders/server'
import { createTrackerRouter } from '@muralink/module-tracker/server'
import { createHabitsRouter } from '@muralink/module-habits/server'
import { createAppointmentsRouter } from '@muralink/module-calendar/server'
import { createStockRouter } from '@muralink/module-stock/server'
import { createCalcsheetRouter } from '@muralink/module-calcsheet/server'
import { createExpensesRouter } from '@muralink/module-expenses/server'
import { createEmployeesRouter } from '@muralink/module-employees/server'
import { createAttendanceRouter } from '@muralink/module-attendance/server'
import { createPasswordsRouter } from '@muralink/module-passwords/server'
import { createVideoEditorRouter } from '@muralink/module-video-editor/server'
import { attachRealtime } from '@muralink/realtime'
import {
  createGalleryRouter,
  startGalleryWorker,
  scanRoot,
  indexFile,
  findByHash,
  type GalleryFileAccess,
  type GalleryWorker,
} from '@muralink/module-gallery/server'
import { mimeFor, safePathWithin, serveFile } from './file-routes/index.ts'
import {
  createMailRouter,
  startMailWorker,
  initMailSchema,
  effectiveMailConfig,
  type MailFileAccess,
  type MailWorker,
} from '@muralink/module-mail/server'
import { mailConfig } from './mail-server/config.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env['PORT'] ?? 3001)

const instanceConfig = loadInstanceConfig()

// Ensure data dir exists. ELIO_DATA_DIR relocates all instance state (db + any
// data files) — a self-host knob like PORT/ELIO_NAS_ROOT; still single-user.
const dataDir = process.env['ELIO_DATA_DIR']
  ? path.resolve(process.env['ELIO_DATA_DIR'])
  : path.join(__dirname, '../../data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

// Init DB and registry. syncCatalog first: the registry is the *installed*
// subset of the build's catalog, so the table must know about this build's
// modules before anything reads it.
const db = getDb()
syncCatalog(db)
console.log(`ModuleRegistry: ${getRegistry().all().map(m => m.id).join(', ')}`)

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

// Stripe webhook MUST be mounted before express.json(): signature verification
// needs the RAW request bytes, and a parsed body breaks it silently. It's also
// mounted before authMiddleware — it authenticates by Stripe signature, not a
// bearer token (same "mount before auth" precedent as /api/__presence below).
// If you ever move this below express.json(), the signature check breaks.
const paymentRegistry = buildPaymentRegistry()
app.post(
  '/api/payments/webhook',
  express.raw({ type: 'application/json' }),
  createPaymentsWebhookHandler(paymentRegistry, db),
)

app.use(express.json())

// Presence is anonymous (the injected web script has no token) — mount before auth.
app.use('/api/__presence', createPresenceRouter())

app.use(authMiddleware)

app.use('/api/files', createFileRouter())

// NAS storage — the user-chosen folder this instance hosts (same-origin so the
// dock's storage section reads it directly).
const nasConfig = resolveNasConfig(instanceConfig)
let galleryWorker: GalleryWorker | null = null
let galleryFiles: GalleryFileAccess | null = null
if (nasConfig) {
  // A fresh instance (e.g. a just-provisioned cloud core) has no files dir yet;
  // create it so the first /list doesn't 500.
  fs.mkdirSync(nasConfig.rootPath, { recursive: true })
  // Storage cap (ELIO_NAS_MAX_BYTES) — absent = unlimited (self-host default).
  const nasQuota = createNasQuota(nasConfig.rootPath, nasConfig.maxBytes ?? null)

  // Gallery file capability: built from the platform's own file helpers so the
  // module never imports from platforms/*. Thumbs live OUTSIDE the NAS root —
  // they are a regenerable cache, not user data.
  galleryFiles = {
    root: nasConfig.rootPath,
    resolve: rel => safePathWithin(nasConfig.rootPath, path.join(nasConfig.rootPath, rel)),
    serve: serveFile,
    mimeFor,
    thumbDir: process.env['ELIO_GALLERY_THUMB_DIR'] ?? path.join(dataDir, 'gallery-thumbs'),
  }
  galleryWorker = startGalleryWorker(db, galleryFiles)

  app.use('/api/storage', createStorageRouter(nasConfig.rootPath, {
    // Freshly uploaded media enters the gallery index immediately; storage
    // itself stays ignorant of gallery — the platform owns this wiring.
    onFileWritten: rel => { if (galleryFiles) indexFile(db, galleryFiles, rel, galleryWorker ?? undefined) },
    // Advisory dedup against the media index (hash jobs fill it lazily).
    findDuplicate: sha256 => findByHash(db, sha256)?.path ?? null,
  }, nasQuota))
  // Per-share scoped-token mint/revoke (master-only) — used by the orchester
  // tunnel-agent to credential an external folder share. See folder-share-relay.md.
  app.use('/api/shares', createScopedShareRouter(nasConfig.rootPath))
  app.use('/api/gallery', requireInstalled(db, 'gallery'), createGalleryRouter(db, galleryFiles, galleryWorker))
  console.log(`NAS storage mounted at /api/storage (root: ${nasConfig.rootPath})`)
  console.log(`Gallery mounted at /api/gallery (thumbs: ${galleryFiles.thumbDir})`)
}

// Google Calendar two-way sync is an optional path: only active when
// GOOGLE_CLIENT_ID/SECRET are configured. When off, the calendar is untouched.
const gcfg = googleConfig()
if (gcfg.enabled) {
  initGoogleSchema(db)
  app.use('/api/calendar/google', requireInstalled(db, 'calendar'), createGoogleRouter(db, gcfg))
  app.use('/api/calendar', requireInstalled(db, 'calendar'), createCalendarRouter(db, googleWriteHooks(db)))
  startGoogleSync(db, gcfg)
  console.log(`Google Calendar sync enabled (calendar: ${gcfg.calendarId}, poll: ${gcfg.pollMs}ms)`)
} else {
  app.use('/api/calendar', requireInstalled(db, 'calendar'), createCalendarRouter(db))
}

// Mail. The API (incl. the local-mailbox setup wizard at /api/mail/setup) is
// always mounted: the wizard is how an unconfigured instance becomes a
// configured one, so gating the whole surface on ELIO_MAIL_ENABLED would make
// self-hosted mail unreachable from the UI. Env only seeds the config; the
// persisted row written by the wizard wins afterwards. The *worker* still
// starts only when mail is actually on.
const mcfg = mailConfig()
let mailWorker: MailWorker | null = null
let mailFiles: MailFileAccess | null = null
{
  initMailSchema(db)
  const mailLive = effectiveMailConfig(db, mcfg)
  // Attachments live INSIDE the NAS root when storage is on — the unified
  // convention (murales/, mail/, …) so the files module sees every module's
  // uploads and the storage quota counts them. NAS off → standalone fallback.
  const mailRoot = nasConfig ? path.join(nasConfig.rootPath, 'mail') : path.join(dataDir, 'mail-attachments')
  mailFiles = {
    root: mailRoot,
    resolve: rel => safePathWithin(mailRoot, rel),
    serve: serveFile,
    mimeFor,
    attachDir: mailRoot,
  }
  if (mailLive.enabled) mailWorker = startMailWorker(db, mailFiles, mailLive)
  app.use('/api/mail', requireInstalled(db, 'mail'), createMailRouter(db, mailFiles, mailLive))
  console.log(
    mailLive.enabled
      ? `Mail service mounted at /api/mail (domain: ${mailLive.domain})`
      : 'Mail API mounted at /api/mail (not enabled — setup wizard available at /api/mail/setup)',
  )
}

// Module install seam — which of the bundled modules this instance runs.
// Mounted before the module routes it gates so a 409'd client can immediately
// GET /api/modules and see why. onChange rebuilds the registry in place, so an
// install takes effect on the next request with no restart.
app.use('/api/modules', createModulesRouter(db, { onChange: () => { rebuildRegistry() } }))

// Module routes. Each is gated on its module being installed — uninstalled
// answers 409 module_not_installed. The tables stay; only the surface closes.
app.use('/api/contacts', requireInstalled(db, 'contacts'), createContactsRouter(db))
app.use('/api/notes', requireInstalled(db, 'notes'), createNotesRouter(db))
app.use('/api/murales', requireInstalled(db, 'murales'), createMuralesRouter(db))
app.use('/api/reminders', requireInstalled(db, 'reminders'), createRemindersRouter(db))
app.use('/api/tracker', requireInstalled(db, 'tracker'), createTrackerRouter(db))
app.use('/api/habits', requireInstalled(db, 'habits'), createHabitsRouter(db))
// appointments is part of the calendar module (merged) — one install, two mounts.
app.use('/api/appointments', requireInstalled(db, 'calendar'), createAppointmentsRouter(db, workingHours))
app.use('/api/stock', requireInstalled(db, 'stock'), createStockRouter(db))
app.use('/api/calcsheet', requireInstalled(db, 'calcsheet'), createCalcsheetRouter(db))
app.use('/api/expenses', requireInstalled(db, 'expenses'), createExpensesRouter(db))
app.use('/api/employees', requireInstalled(db, 'employees'), createEmployeesRouter(db))
// attendance depends on employees (manifest.ts) — the FK is real, but the
// install gate is independent: attendance's routes 409 on their own if
// uninstalled, same as any other module.
app.use('/api/attendance', requireInstalled(db, 'attendance'), createAttendanceRouter(db))
// Password vault. The core stores sealed blobs and the PIN salt/verifier; it
// cannot read an entry, and no route here can be made to — see the module's
// server README before adding one that appears to need plaintext.
app.use('/api/passwords', requireInstalled(db, 'passwords'), createPasswordsRouter(db))

// The realtime hub is module-agnostic (packages/realtime): one websocket
// endpoint, rooms keyed by whatever a module asks for. video-editor is its
// first consumer, not its owner. The upgrade handshake happens before Express
// runs, so it validates the token itself rather than through authMiddleware.
const httpServer = http.createServer(app)
const realtimeHub = attachRealtime(httpServer, { verifyToken: isValidToken })
app.use('/api/video-editor', requireInstalled(db, 'video-editor'), createVideoEditorRouter(db, realtimeHub))

// Vault layout store — cloud persistence for vault dashboards' grid composition.
// Domain data of cells inside a vault uses the module stores above via cloud Spaces.
app.use('/api/vault/layouts', createVaultLayoutsRouter(db))

// Relation graph — core, cross-module. Typed directional edges between instances
// plus the discoverable A→B relation-type map. Read/written by @muralink/spaces.
app.use('/api/relations', createRelationsRouter(db))
app.use('/api/relation-types', createRelationTypesRouter(db))

// Payments — the swappable checkout seam (Mock by default; Stripe when the SDK
// + STRIPE_SECRET_KEY are configured server-side). Charges a computed price.
app.use('/api/payments', createPaymentsRouter(paymentRegistry, db))

// AI — stateless LLM proxy (Ollama local by default; online providers when an
// ELIO_*_API_KEY is set). The web client runs the agent loop; tools execute
// there against the spaces layer, never here.
app.use('/api/ai', createAiRouter(buildAiRegistry()))

// getRegistry() (not a boot-time capture): the installed set changes at runtime.
app.get('/health', (_req, res) => {
  res.json({ ok: true, instance: instanceConfig.id, modules: getRegistry().all().map(m => m.id) })
})

httpServer.listen(PORT, () => {
  console.log(`${instanceConfig.name} server running on http://localhost:${PORT}`)
  presenceService.start()
  // Initial gallery scan AFTER the server is up — first paint never waits on it.
  if (galleryFiles) void scanRoot(db, galleryFiles, galleryWorker ?? undefined)
  // Tunnel registration is NOT done here. Registering an instance needs a user
  // SESSION token (POST /instances/register is user-authed) — an env var cannot
  // provide that. Registration + the outbound agent link are owned by the
  // orchester account link (packages/orchester/src/account.ts, ~/.elio/account.json),
  // which the user drives by logging in to their Tunnel account. Anonymous-first:
  // with no account linked the server just runs standalone.

  // Optional standalone LAN server on its own port (P2P/LAN peers).
  if (nasConfig && process.env['ELIO_NAS_STANDALONE'] === 'true') void startFileServer(nasConfig)
})
