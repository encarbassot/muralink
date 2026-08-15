import fs from 'fs'
import path from 'path'
import type { MailConfig } from './config.ts'

export interface TLSCert {
  keyPath: string
  certPath: string
  expiresAt: Date
}

export async function getOrCreateTLSCert(config: MailConfig, dataDir: string): Promise<TLSCert | null> {
  if (!config.domain) return null

  const certDir = path.join(dataDir, 'mail-certs')
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true })

  const keyPath = path.join(certDir, `${config.domain}.key`)
  const certPath = path.join(certDir, `${config.domain}.crt`)

  // TODO: Implement ACME (Let's Encrypt) cert issuance/renewal
  // For now, this is a placeholder that expects certs to be provided externally
  // or generated manually via `openssl req -x509 ...`

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      keyPath,
      certPath,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Placeholder
    }
  }

  return null
}
