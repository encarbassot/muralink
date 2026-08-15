# Mail Module — Implementation Status

## MVP Scaffolding Complete ✓

### Module Structure (`modules/mail/`)
- **Types** (`types.ts`) — `YEmailMessage`, `YMailFolder`, `YMailAttachment` with full auth/spam/flag fields
- **Manifest** (`manifest.ts`) — declares `platforms: ['local-server', 'electron', 'web']`
- **Server layer**:
  - `schema.ts` — SQLite tables: `mail_folders`, `mail_messages`, `mail_attachments`, `mail_jobs` (durable queue)
  - `queries.ts` — CRUD helpers for folders, messages, attachments
  - `routes.ts` — `/api/mail/folders`, `/api/mail/messages`, `/api/mail/send`, `/api/mail/attachments/:id`, `/api/mail/search`
  - `jobs.ts` — worker loop following gallery pattern: claim→run→mark done/failed, `setTimeout` idle poll, crash recovery
  - `fileAccess.ts` — capability injection pattern matching gallery
- **Web layer**:
  - `MailApp.tsx` — 3-pane UI stub (folder list / message list / reader)
  - `mailStore.ts` — zustand store for state management

### Server Integration (`platforms/server/`)
- **Mail daemon** (`platforms/server/src/mail-server/`):
  - `config.ts` — `mailConfig()` reads `ELIO_MAIL_*` env vars
  - `tls.ts` — placeholder for ACME cert management (TODO)
  - `daemon.ts` — standalone process entry point
- **Composition root** (`platforms/server/src/index.ts`):
  - Imports mail module + config
  - Conditional block: `if (mcfg.enabled) { initMailSchema(db); app.use('/api/mail', ...) }`
  - Wires mail worker + file capability injection
  - Pattern matches gallery/NAS optional-feature design

### Orchester Service (`packages/orchester/src/services/index.ts`)
- `mailService()` added to `buildDefaultServices()`
- `driver:'process'` spawns `tsx platforms/server/src/mail-server/daemon.ts`
- Env vars passed through: domain, ports, DKIM selector, TLS email

### Dock/UI Wiring (`packages/app/`)
- `dockItems.tsx` — mail tab added (✉️ icon, "Correo" label)
- `modals.tsx` — imports `MailApp` from `@muralink/module-mail/web`, case switched to render it
- Self-hosted web app inherits automatically via shared `<App>` component

### Local-mailbox setup wizard ✓ (nuevo)
- `implementations/server/setup.ts` — tabla `mail_setup` (fila única), DKIM
  RSA-2048 generado en servidor, `dnsRecords()` / `portRequirements()`,
  `verifyDns()` (resolver del sistema) / `verifyPorts()` (bind local),
  `effectiveMailConfig(db, env)` = persistido gana, env siembra
- `implementations/server/setupRoutes.ts` — `/api/mail/setup/{status,dns,ports,verify,detect-ip,enable}`
  montado **siempre** (también con el correo apagado)
- `implementations/web/MailSetupWizard.tsx` — 5 pasos: requisitos → dirección →
  DNS → puertos → activar
- `implementations/web/MailApp.tsx` — reescrito con tokens del tema (las clases
  Tailwind del stub no aplicaban: el proyecto no usa Tailwind); botón
  **+ Añadir correo** → `CellMenu` con Gmail/Outlook muted y "Añadir cuenta
  local" con tag `advanced`
- `platforms/server/src/index.ts` — la API de correo ya no está detrás de
  `ELIO_MAIL_ENABLED`; solo el worker lo está
- Guía: `docs/self-hosted-mail.md`

## What's Stubbed (Phase 2 / Later)

### SMTP/IMAP Listeners
- `platforms/server/src/mail-server/inbound.ts` — **TODO**: wrap `smtp-server` for port 25 (RCPT/DATA)
- `platforms/server/src/mail-server/outbound.ts` — **TODO**: submission listener port 587 (optional, can start with route-only send)
- `platforms/server/src/mail-server/dkim.ts` — **TODO**: DKIM key gen + `mailauth` signing helper

### MIME Processing
- Worker job types (`inbound-process`, `outbound-send`) defined but not implemented
- `mailparser` integration for parsing raw SMTP messages
- `nodemailer` integration for composing/sending
- `mailauth` integration for DKIM/SPF/DMARC verify + sign

### TLS Certificate Management
- `tls.ts` returns null (placeholder)
- **TODO**: `acme-client` integration for Let's Encrypt issuance/renewal
- HTTP-01 challenge serving (or DNS-01 if registrar API available)

### UI Polish
- `MailApp.tsx` is a minimal 3-pane layout, needs:
  - Compose form (Draft/Send flow)
  - Message detail reader (multi-part MIME rendering)
  - Attachment download
  - Flag toggles (read/starred/spam/trash)
  - Search UI

### Anti-Spam (MVP)
- Score persisted in schema but not calculated
- **TODO**: lightweight heuristic scorer in worker job (mailauth alignment + DNSBL + simple rules)

### Electron UI (Service Config Modal)
- `platforms/electronApp/src/renderer/apps/orchester/ServiceConfigModal.tsx` — picks up mail service generically
- **TODO**: dedicated `MailServiceConfigModal.tsx` for domain/DKIM/cert status UI (the generic modal shape doesn't fit mail's config surface)

## Environment Variables (for local dev)

Enable mail and test locally:
```bash
export ELIO_MAIL_ENABLED=true
export ELIO_MAIL_DOMAIN=localhost.test
export ELIO_MAIL_SMTP_PORT=2525
export ELIO_MAIL_SUBMISSION_PORT=2587
export ELIO_MAIL_DKIM_SELECTOR=default
# No TLS for localhost dev — real deployment needs ACME certs
```

The daemon will init the schema + mount the REST API when enabled, but listeners won't accept connections until SMTP/IMAP code is implemented.

## Next Steps (Priority Order)

1. **SMTP inbound listener** — wrap `smtp-server`, validate recipient/domain, parse with `mailparser`, run `mailauth` verification, enqueue `inbound-process` job
2. **Mail worker job processor** — implement `inbound-process` and `outbound-send` handlers in `jobs.ts`
3. **DKIM key generation + signing** — one-time keypair gen, `mailauth` signing in outbound job
4. **Direct MX delivery** — `nodemailer` + `mx-connect` for outbound send
5. **TLS cert acquisition** — `acme-client` for real deployments, HTTP-01 challenge endpoint
6. **Mailbox defaults** — auto-create Inbox/Sent/Spam/Trash on first enable
7. **UI detail pages** — message reader, compose form, attachment download
8. **Anti-spam heuristics** — score calculation in inbound job
9. **Electron config modal** — mail-specific UI for domain/DKIM/cert renewal status
10. **Phase 2**: IMAP protocol via `wildduck` for third-party client interop

## Testing Checklist (once SMTP listener lands)

- [ ] Daemon starts with `ELIO_MAIL_ENABLED=true` + domain
- [ ] `telnet localhost 2525` connects to SMTP listener
- [ ] `curl /api/mail/folders` returns empty list (before any messages)
- [ ] Send test message via `telnet` / `mail-tester.com` / local SMTP relay
- [ ] Message appears in `/api/mail/messages?folder=inbox`
- [ ] Worker processes `inbound-process` job, stores attachment
- [ ] Compose + send from `MailApp.tsx` UI
- [ ] Dock shows "Correo" in both Electron and self-hosted web
- [ ] Graceful restart recovery: kill worker mid-job, restart, confirm `running`→`queued` recovery
