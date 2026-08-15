// Local mailbox setup — the state behind the "añadir cuenta local" wizard.
//
// Config lives in the module's own SQLite row, not only in ELIO_MAIL_* env
// vars: the wizard has to be able to write it at runtime, from the web UI, on
// a machine whose env the user can't edit. Env still wins as the *seed* for a
// fresh install (docker/systemd deployments set it), and the persisted row
// wins afterwards — see `effectiveMailConfig`.
//
// Local-first: nothing here calls out to the network except `verifyDns`, which
// is an explicit user action ("comprobar DNS"), and even that only asks the
// system resolver.

import crypto from 'crypto'
import net from 'net'
import dns from 'dns/promises'
import type Database from 'better-sqlite3'
import type {
  MailDnsCheck,
  MailDnsRecord,
  MailPortCheck,
  MailPortRequirement,
  YMailSetup,
} from '../../types.ts'

const ROW_ID = 'singleton'

export interface MailSetupRow {
  domain: string
  mailbox: string
  public_ip: string
  smtp_port: number
  submission_port: number
  dkim_selector: string
  dkim_private_key: string
  dkim_public_key: string
  tls_email: string
  enabled: number
  updated_at: string
}

export function initMailSetupSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_setup (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      mailbox TEXT NOT NULL DEFAULT 'hello',
      public_ip TEXT NOT NULL DEFAULT '',
      smtp_port INTEGER NOT NULL DEFAULT 25,
      submission_port INTEGER NOT NULL DEFAULT 587,
      dkim_selector TEXT NOT NULL DEFAULT 'default',
      dkim_private_key TEXT NOT NULL DEFAULT '',
      dkim_public_key TEXT NOT NULL DEFAULT '',
      tls_email TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `)
}

export function getSetupRow(db: Database.Database): MailSetupRow | null {
  return (db.prepare('SELECT * FROM mail_setup WHERE id = ?').get(ROW_ID) as MailSetupRow) ?? null
}

/** The client-safe projection — never carries the DKIM private key. */
export function getSetup(db: Database.Database): YMailSetup {
  const row = getSetupRow(db)
  if (!row) {
    return {
      configured: false,
      enabled: false,
      domain: '',
      mailbox: 'hello',
      address: '',
      mailHost: '',
      publicIp: '',
      smtpPort: 25,
      submissionPort: 587,
      dkimSelector: 'default',
      dkimPublicKey: '',
      tlsEmail: '',
      updatedAt: '',
    }
  }
  return {
    configured: true,
    enabled: row.enabled === 1,
    domain: row.domain,
    mailbox: row.mailbox,
    address: `${row.mailbox}@${row.domain}`,
    mailHost: mailHostFor(row.domain),
    publicIp: row.public_ip,
    smtpPort: row.smtp_port,
    submissionPort: row.submission_port,
    dkimSelector: row.dkim_selector,
    dkimPublicKey: row.dkim_public_key,
    tlsEmail: row.tls_email,
    updatedAt: row.updated_at,
  }
}

/** `elioputo.mural.ink` → `mail.elioputo.mural.ink`. Already-`mail.` domains stay put. */
export function mailHostFor(domain: string): string {
  return domain.startsWith('mail.') ? domain : `mail.${domain}`
}

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/
const MAILBOX_RE = /^[a-z0-9]([a-z0-9._+-]{0,62}[a-z0-9])?$/

export function validateSetupInput(input: { domain?: string; mailbox?: string }): string | null {
  const domain = (input.domain ?? '').trim().toLowerCase()
  const mailbox = (input.mailbox ?? '').trim().toLowerCase()
  if (!DOMAIN_RE.test(domain)) return 'invalid_domain'
  if (!MAILBOX_RE.test(mailbox)) return 'invalid_mailbox'
  return null
}

export interface SaveSetupInput {
  domain: string
  mailbox: string
  publicIp?: string
  smtpPort?: number
  submissionPort?: number
  dkimSelector?: string
  tlsEmail?: string
  enabled?: boolean
}

/**
 * Upsert the config, generating the DKIM keypair on first write (or when the
 * selector changes — a new selector needs a new key or the published TXT and
 * the signature disagree).
 */
export function saveSetup(db: Database.Database, input: SaveSetupInput): YMailSetup {
  const prev = getSetupRow(db)
  const domain = input.domain.trim().toLowerCase()
  const mailbox = input.mailbox.trim().toLowerCase()
  const selector = (input.dkimSelector ?? prev?.dkim_selector ?? 'default').trim().toLowerCase()

  const rotate = !prev || !prev.dkim_private_key || selector !== prev.dkim_selector
  const keys = rotate ? generateDkimKeypair() : { privateKey: prev.dkim_private_key, publicKey: prev.dkim_public_key }

  const row: MailSetupRow = {
    domain,
    mailbox,
    public_ip: (input.publicIp ?? prev?.public_ip ?? '').trim(),
    smtp_port: input.smtpPort ?? prev?.smtp_port ?? 25,
    submission_port: input.submissionPort ?? prev?.submission_port ?? 587,
    dkim_selector: selector,
    dkim_private_key: keys.privateKey,
    dkim_public_key: keys.publicKey,
    tls_email: (input.tlsEmail ?? prev?.tls_email ?? '').trim(),
    enabled: (input.enabled ?? (prev ? prev.enabled === 1 : false)) ? 1 : 0,
    updated_at: new Date().toISOString(),
  }

  db.prepare(`
    INSERT INTO mail_setup (
      id, domain, mailbox, public_ip, smtp_port, submission_port,
      dkim_selector, dkim_private_key, dkim_public_key, tls_email, enabled, updated_at
    ) VALUES (
      @id, @domain, @mailbox, @public_ip, @smtp_port, @submission_port,
      @dkim_selector, @dkim_private_key, @dkim_public_key, @tls_email, @enabled, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      domain = excluded.domain,
      mailbox = excluded.mailbox,
      public_ip = excluded.public_ip,
      smtp_port = excluded.smtp_port,
      submission_port = excluded.submission_port,
      dkim_selector = excluded.dkim_selector,
      dkim_private_key = excluded.dkim_private_key,
      dkim_public_key = excluded.dkim_public_key,
      tls_email = excluded.tls_email,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `).run({ id: ROW_ID, ...row })

  return getSetup(db)
}

export function setEnabled(db: Database.Database, enabled: boolean): YMailSetup {
  const row = getSetupRow(db)
  if (!row) throw new Error('mail_not_configured')
  db.prepare('UPDATE mail_setup SET enabled = ?, updated_at = ? WHERE id = ?').run(
    enabled ? 1 : 0,
    new Date().toISOString(),
    ROW_ID,
  )
  return getSetup(db)
}

/** RSA-2048 is what every receiver verifies; ed25519 DKIM is still not universal. */
export function generateDkimKeypair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'der' },
  })
  return { privateKey: privateKey as unknown as string, publicKey: (publicKey as unknown as Buffer).toString('base64') }
}

/**
 * The env/persisted merge the daemon and the API both run on. Persisted config
 * wins because it is the one the user just wrote in the wizard; env only fills
 * the holes (and seeds a brand-new install).
 */
export function effectiveMailConfig(
  db: Database.Database,
  env: { enabled: boolean; domain?: string; smtpPort?: number; submissionPort?: number; dkimSelector?: string; tlsEmail?: string },
): { enabled: boolean; domain?: string; smtpPort: number; submissionPort: number; dkimSelector: string; tlsEmail?: string; dkimPrivateKey?: string; mailbox?: string } {
  const row = getSetupRow(db)
  if (!row) {
    return {
      enabled: env.enabled,
      domain: env.domain,
      smtpPort: env.smtpPort ?? 25,
      submissionPort: env.submissionPort ?? 587,
      dkimSelector: env.dkimSelector ?? 'default',
      tlsEmail: env.tlsEmail,
    }
  }
  return {
    enabled: row.enabled === 1,
    domain: row.domain,
    mailbox: row.mailbox,
    smtpPort: row.smtp_port,
    submissionPort: row.submission_port,
    dkimSelector: row.dkim_selector,
    tlsEmail: row.tls_email || env.tlsEmail,
    dkimPrivateKey: row.dkim_private_key,
  }
}

// ─── What the operator must publish and open ────────────────────────────────

export function dnsRecords(setup: YMailSetup): MailDnsRecord[] {
  const { domain, mailHost, dkimSelector, dkimPublicKey, publicIp, address } = setup
  const ip = publicIp || '<IP-PÚBLICA-DEL-SERVIDOR>'

  return [
    {
      id: 'a-mail',
      type: 'A',
      name: mailHost,
      value: ip,
      ttl: 3600,
      required: true,
      note: 'El host del servidor de correo. Debe apuntar a la IP pública fija donde corre el orchester.',
    },
    {
      id: 'mx',
      type: 'MX',
      name: domain,
      value: `${mailHost}.`,
      ttl: 3600,
      priority: 10,
      required: true,
      note: `Dice al mundo que el correo de @${domain} se entrega en ${mailHost}.`,
    },
    {
      id: 'spf',
      type: 'TXT',
      name: domain,
      value: 'v=spf1 mx -all',
      ttl: 3600,
      required: true,
      note: 'Solo los hosts del MX pueden enviar en tu nombre. -all = el resto se rechaza.',
    },
    {
      id: 'dkim',
      type: 'TXT',
      name: `${dkimSelector}._domainkey.${domain}`,
      value: `v=DKIM1; k=rsa; p=${dkimPublicKey || '<clave-pública-pendiente>'}`,
      ttl: 3600,
      required: true,
      note: 'Clave pública con la que se verifica la firma. La privada nunca sale del servidor.',
    },
    {
      id: 'dmarc',
      type: 'TXT',
      name: `_dmarc.${domain}`,
      value: `v=DMARC1; p=quarantine; adkim=s; aspf=s; rua=mailto:${address || `postmaster@${domain}`}`,
      ttl: 3600,
      required: true,
      note: 'Qué hacer si SPF/DKIM fallan. Empieza en quarantine; sube a p=reject cuando lleve semanas limpio.',
    },
    {
      id: 'ptr',
      type: 'PTR',
      name: ip,
      value: `${mailHost}.`,
      ttl: 3600,
      required: true,
      note: 'DNS inverso. NO se pone en tu registrador: lo configura quien te da la IP (VPS/ISP). Sin PTR, Gmail y Outlook te mandan a spam o te rechazan.',
    },
    {
      id: 'a-autoconfig',
      type: 'A',
      name: `autoconfig.${domain}`,
      value: ip,
      ttl: 3600,
      required: false,
      note: 'Opcional: autoconfiguración para clientes de escritorio (Thunderbird). No hace falta para la webmail.',
    },
  ]
}

export function portRequirements(setup: YMailSetup): MailPortRequirement[] {
  return [
    {
      port: setup.smtpPort || 25,
      protocol: 'tcp',
      direction: 'inbound',
      purpose: 'SMTP — recibir correo de otros servidores',
      required: true,
      note: 'Abrir en firewall y redirigir en el router hacia esta máquina.',
    },
    {
      port: 25,
      protocol: 'tcp',
      direction: 'outbound',
      purpose: 'SMTP — entrega directa a los MX de destino',
      required: true,
      note: 'Casi todos los ISP domésticos bloquean el 25 de salida. Si está bloqueado necesitas un VPS o un relay SMTP; recibir sí funciona, enviar no.',
    },
    {
      port: 80,
      protocol: 'tcp',
      direction: 'inbound',
      purpose: 'ACME HTTP-01 — emitir/renovar el certificado TLS de ' + (setup.mailHost || 'mail.<dominio>'),
      required: true,
      note: 'Sin certificado, el STARTTLS del puerto 25 va con cert autofirmado y muchos receptores lo penalizan.',
    },
    {
      port: setup.submissionPort || 587,
      protocol: 'tcp',
      direction: 'inbound',
      purpose: 'Submission (STARTTLS) — clientes externos que envían por SMTP',
      required: false,
      note: 'La webmail de Muralink envía por HTTP, no lo necesita. Ábrelo solo si vas a usar Thunderbird / el cliente del móvil.',
    },
    {
      port: 465,
      protocol: 'tcp',
      direction: 'inbound',
      purpose: 'Submission con TLS implícito',
      required: false,
      note: 'Alternativa al 587 para clientes viejos.',
    },
    {
      port: 993,
      protocol: 'tcp',
      direction: 'inbound',
      purpose: 'IMAPS — sincronizar con clientes de correo de terceros',
      required: false,
      note: 'Fase 2: el daemon todavía no habla IMAP.',
    },
  ]
}

// ─── Verification ───────────────────────────────────────────────────────────

function flat(txt: string[][]): string[] {
  return txt.map(chunks => chunks.join(''))
}

async function check(id: string, expected: string, run: () => Promise<string[]>, match: (found: string[]) => boolean): Promise<MailDnsCheck> {
  try {
    const found = await run()
    return { id, ok: match(found), expected, found }
  } catch (err) {
    return { id, ok: false, expected, found: [], error: err instanceof Error ? err.message : String(err) }
  }
}

/** Asks the system resolver. Propagation is slow — a red check right after publishing is normal. */
export async function verifyDns(setup: YMailSetup): Promise<MailDnsCheck[]> {
  const { domain, mailHost, dkimSelector, dkimPublicKey, publicIp } = setup
  if (!domain) return []

  const records = dnsRecords(setup)
  const expect = (id: string) => records.find(r => r.id === id)?.value ?? ''

  return Promise.all([
    check('a-mail', expect('a-mail'), () => dns.resolve4(mailHost), found =>
      publicIp ? found.includes(publicIp) : found.length > 0,
    ),
    check('mx', expect('mx'), async () => (await dns.resolveMx(domain)).map(r => `${r.priority} ${r.exchange}`), found =>
      found.some(v => v.toLowerCase().endsWith(mailHost.toLowerCase())),
    ),
    check('spf', expect('spf'), async () => flat(await dns.resolveTxt(domain)), found =>
      found.some(v => v.toLowerCase().startsWith('v=spf1')),
    ),
    check('dkim', expect('dkim'), async () => flat(await dns.resolveTxt(`${dkimSelector}._domainkey.${domain}`)), found =>
      found.some(v => v.replace(/\s+/g, '').includes(`p=${dkimPublicKey}`.replace(/\s+/g, ''))),
    ),
    check('dmarc', expect('dmarc'), async () => flat(await dns.resolveTxt(`_dmarc.${domain}`)), found =>
      found.some(v => v.toLowerCase().startsWith('v=dmarc1')),
    ),
    check('ptr', expect('ptr'), () => (publicIp ? dns.reverse(publicIp) : Promise.resolve([])), found =>
      found.some(v => v.toLowerCase() === mailHost.toLowerCase()),
    ),
  ])
}

/**
 * Local bind check only. Whether the internet can actually reach port 25 needs
 * a prober outside the NAT — that arrives with the tunnel, not here. Saying so
 * beats a green tick that means nothing.
 */
export async function verifyPorts(setup: YMailSetup): Promise<MailPortCheck[]> {
  const ports = [setup.smtpPort || 25, setup.submissionPort || 587]
  return Promise.all(ports.map(port => probeLocal(port)))
}

function probeLocal(port: number, timeoutMs = 800): Promise<MailPortCheck> {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = (listening: boolean, error?: string) => {
      socket.destroy()
      resolve({ port, listening, ...(error ? { error } : {}) })
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false, 'timeout'))
    socket.once('error', err => done(false, err.message))
  })
}

/** The env block an operator pastes into systemd/docker to survive a rebuild. */
export function envSnippet(setup: YMailSetup): string {
  return [
    'ELIO_MAIL_ENABLED=true',
    `ELIO_MAIL_DOMAIN=${setup.domain}`,
    `ELIO_MAIL_SMTP_PORT=${setup.smtpPort}`,
    `ELIO_MAIL_SUBMISSION_PORT=${setup.submissionPort}`,
    `ELIO_MAIL_DKIM_SELECTOR=${setup.dkimSelector}`,
    setup.tlsEmail ? `ELIO_MAIL_TLS_EMAIL=${setup.tlsEmail}` : '# ELIO_MAIL_TLS_EMAIL=tu@correo.tld',
  ].join('\n')
}
