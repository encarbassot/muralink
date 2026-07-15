// Self-signed TLS cert generation for the https gateway.
// Uses the system `openssl` (present on macOS and Raspberry Pi OS). For a real
// deployment, swap this for Let's Encrypt — the gateway only needs cert+key PEMs.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from './paths'

export interface TlsCert {
  cert: string
  key: string
}

// Returns existing cert/key for `domain`, generating a self-signed pair if absent.
export function ensureSelfSigned(domain = 'localhost'): TlsCert {
  mkdirSync(paths.tls, { recursive: true })
  const certPath = join(paths.tls, `${domain}.crt`)
  const keyPath = join(paths.tls, `${domain}.key`)

  if (!existsSync(certPath) || !existsSync(keyPath)) {
    const result = spawnSync(
      'openssl',
      [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', keyPath,
        '-out', certPath,
        '-days', '825',
        '-subj', `/CN=${domain}`,
        '-addext', `subjectAltName=DNS:${domain},DNS:localhost,IP:127.0.0.1`,
      ],
      { stdio: 'pipe' },
    )
    if (result.status !== 0) {
      throw new Error(`openssl failed: ${result.stderr?.toString() ?? 'unknown error'}`)
    }
  }

  return { cert: readFileSync(certPath, 'utf-8'), key: readFileSync(keyPath, 'utf-8') }
}
