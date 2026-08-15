export interface YEmailMessage {
  id: string
  messageId: string
  folderId: string
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  date: string // ISO 8601
  inReplyTo?: string
  references?: string[]
  mimeType: 'text/plain' | 'text/html' | 'multipart/mixed'
  body: string
  attachmentIds: string[]
  flags: {
    read: boolean
    starred: boolean
    spam: boolean
    trash: boolean
  }
  spamScore: number
  spamThreshold: number
  authResult: {
    spf: 'pass' | 'fail' | 'softfail' | 'neutral' | 'none'
    dkim: 'pass' | 'fail' | 'neutral' | 'none'
    dmarc: 'pass' | 'fail' | 'quarantine' | 'reject' | 'none'
  }
  rawSize: number
  createdAt: string
}

export interface YMailFolder {
  id: string
  name: string
  type: 'inbox' | 'sent' | 'spam' | 'trash' | 'drafts' | 'custom'
  messageCount: number
  unreadCount: number
  createdAt: string
}

// ─── Local mailbox setup ────────────────────────────────────────────────────
// Running your own mail server is the "advanced" path: the instance owns the
// domain's MX and signs with its own DKIM key. Everything below describes what
// the operator must publish (DNS) and open (firewall) for that to work. The
// private DKIM key never leaves the server — only `dkimPublicKey` is exposed.

export interface YMailSetup {
  configured: boolean
  /** Mail daemon armed. Configured but disabled = records published, not yet live. */
  enabled: boolean
  domain: string // elioputo.mural.ink
  mailbox: string // hello
  address: string // hello@elioputo.mural.ink
  mailHost: string // mail.elioputo.mural.ink — the A record the MX points at
  publicIp: string
  smtpPort: number
  submissionPort: number
  dkimSelector: string
  dkimPublicKey: string // base64 SPKI, the p= value of the DKIM TXT record
  tlsEmail: string
  updatedAt: string
}

export interface MailDnsRecord {
  id: string
  type: 'A' | 'MX' | 'TXT' | 'PTR'
  name: string
  value: string
  ttl: number
  priority?: number
  required: boolean
  /** Why it exists / what breaks without it. Shown under the row in the wizard. */
  note?: string
}

export interface MailPortRequirement {
  port: number
  protocol: 'tcp'
  direction: 'inbound' | 'outbound'
  purpose: string
  required: boolean
  note?: string
}

export interface MailDnsCheck {
  id: string
  ok: boolean
  expected: string
  found: string[]
  error?: string
}

export interface MailPortCheck {
  port: number
  /** Only tells you the listener is bound locally — not that the internet can reach it. */
  listening: boolean
  error?: string
}

export interface YMailAttachment {
  id: string
  messageId: string
  filename: string
  mimeType: string
  size: number
  storagePath: string
  uploadedAt: string
}
