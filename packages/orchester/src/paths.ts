// Filesystem layout for a single instance's runtime state.
// Everything lives under ~/.elio so a headless instance (raspberry, server)
// and a desktop instance share one well-known home.

import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

export const elioHome = process.env['ELIO_HOME'] ?? join(homedir(), '.elio')

export const paths = {
  home: elioHome,
  socket: join(elioHome, 'orchester.sock'),
  state: join(elioHome, 'orchester.json'),
  instance: join(elioHome, 'instance.json'),
  account: join(elioHome, 'account.json'),
  tls: join(elioHome, 'tls'),
  log: join(elioHome, 'orchester.log'),
}

// Ensure the home dir exists before anything writes to it.
export function ensureHome(): void {
  mkdirSync(elioHome, { recursive: true })
}
