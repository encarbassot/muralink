export interface MailConfig {
  enabled: boolean
  domain?: string
  tlsEmail?: string
  smtpPort?: number
  submissionPort?: number
  dkimSelector?: string
  dkimKeyPath?: string
}

export function mailConfig(): MailConfig {
  const domain = process.env['ELIO_MAIL_DOMAIN']
  const enabled = Boolean(domain && process.env['ELIO_MAIL_ENABLED'] === 'true')

  return {
    enabled,
    domain: domain || undefined,
    tlsEmail: process.env['ELIO_MAIL_TLS_EMAIL'],
    smtpPort: process.env['ELIO_MAIL_SMTP_PORT'] ? Number(process.env['ELIO_MAIL_SMTP_PORT']) : 25,
    submissionPort: process.env['ELIO_MAIL_SUBMISSION_PORT'] ? Number(process.env['ELIO_MAIL_SUBMISSION_PORT']) : 587,
    dkimSelector: process.env['ELIO_MAIL_DKIM_SELECTOR'] ?? 'default',
    dkimKeyPath: process.env['ELIO_MAIL_DKIM_KEY_PATH'],
  }
}
