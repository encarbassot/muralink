import path from 'path'
import { fileURLToPath } from 'url'
import { getDb } from '../db.ts'
import { mailConfig } from './config.ts'
import { initMailSchema, effectiveMailConfig, getSetup, mailHostFor } from '@muralink/module-mail/server'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env['ELIO_DATA_DIR']
  ? path.resolve(process.env['ELIO_DATA_DIR'])
  : path.join(__dirname, '../../../data')

// Schema first: the persisted setup row (written by the wizard at
// /api/mail/setup) is the primary source of config, env only seeds it. Init
// before reading, or a fresh install has no table to read from.
const db = getDb()
initMailSchema(db)

const config = effectiveMailConfig(db, mailConfig())

if (!config.enabled || !config.domain) {
  console.log(
    'Mail daemon: not enabled — run the "añadir cuenta local" wizard in the mail app, ' +
      'or set ELIO_MAIL_ENABLED=true + ELIO_MAIL_DOMAIN.',
  )
  db.close()
  process.exit(0)
}

const setup = getSetup(db)
console.log(`Mail daemon starting for domain: ${config.domain} (host ${mailHostFor(config.domain)})`)
if (setup.configured) {
  console.log(`Mailbox: ${setup.address} · DKIM selector: ${setup.dkimSelector}`)
  if (!setup.publicIp) console.log('Warning: no public IP recorded — PTR/A checks in the wizard will be inconclusive.')
}

// TODO: Implement SMTP listener on port config.smtpPort
// TODO: Implement submission listener (optional) on port config.submissionPort
// TODO: Wire up mailparser + mailauth for inbound processing
// TODO: Wire up nodemailer for outbound delivery

console.log(`Mail daemon listening on port ${config.smtpPort}`)

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Mail daemon shutting down...')
  db.close()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('Mail daemon interrupted')
  db.close()
  process.exit(0)
})
