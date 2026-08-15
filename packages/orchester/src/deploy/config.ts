// The deploy answer sheet — everything the wizard asks once and every step
// then reads. Persisted to ~/.elio/deploy.json so a wizard run survives a
// dropped SSH session, a reboot, or the operator going to lunch mid-deploy.
//
// The gate password is deliberately NOT persisted: it exists only in the
// process that sets it, is hashed with scrypt, and is gone. The hash, the
// cookie-signing secret and the API token ARE persisted — the running service
// has to verify logins across restarts, and the systemd env file and the nginx
// site have to keep agreeing on the token.

import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, userInfo } from 'node:os'
import { elioHome, ensureHome } from '../paths'

export type WebServer = 'nginx' | 'none'
export type TlsMode = 'acme' | 'self-signed' | 'none'

export interface DeployConfig {
  // ── identity ──────────────────────────────────────────────────────────────
  domain: string
  // Extra names the site answers to (LAN IP, bare hostname).
  aliases: string[]
  // ACME contact address. Also the obvious "who owns this box" record.
  adminEmail: string

  // ── placement ─────────────────────────────────────────────────────────────
  // Monorepo checkout the services run from.
  repoRoot: string
  // Where repoRoot comes from when it does not exist yet. The public repo is
  // clonable anonymously, which is what makes a bare box able to bootstrap
  // itself without a key, a token, or an account.
  repoUrl: string
  repoBranch: string
  // Unix user the daemon runs as.
  serviceUser: string
  // ELIO_DATA_DIR — sqlite db + regenerable caches.
  dataDir: string
  // ELIO_NAS_ROOT — the folder served at /api/storage. The user's actual files.
  storageRoot: string

  // ── ports ─────────────────────────────────────────────────────────────────
  corePort: number
  webPort: number

  // ── exposure ──────────────────────────────────────────────────────────────
  webServer: WebServer
  tls: TlsMode
  // The master bearer token. Never leaves the box: nginx injects it upstream.
  apiToken: string
  // The account that may log in. Empty user = no gate.
  basicAuthUser: string
  // scrypt hash of the gate password, and the key that signs session cookies.
  // The password itself is never stored; these two are, because the running
  // service must verify a login and a signature across restarts.
  authHash: string
  sessionSecret: string
}

export const DEPLOY_STATE = join(elioHome, 'deploy.json')

export function defaultConfig(): DeployConfig {
  // Assume the checkout this code is running from is the one to deploy —
  // right in every case except an operator who copied the CLI somewhere odd.
  // fileURLToPath, never URL.pathname: the latter percent-encodes non-ASCII
  // path segments and the repo directory is allowed to contain any character.
  const here = dirname(fileURLToPath(import.meta.url))
  const repoRoot = resolve(here, '../../../..')
  const home = homedir()
  return {
    domain: '',
    aliases: [],
    adminEmail: '',
    repoRoot,
    repoUrl: 'https://github.com/encarbassot/muralink.git',
    repoBranch: 'main',
    serviceUser: userInfo().username,
    dataDir: join(home, '.muralink/data'),
    storageRoot: join(home, 'muralink-storage'),
    corePort: 3001,
    webPort: 3000,
    webServer: 'nginx',
    tls: 'acme',
    apiToken: '',
    basicAuthUser: 'admin',
    authHash: '',
    sessionSecret: '',
  }
}

export function newApiToken(): string {
  return randomBytes(32).toString('hex')
}

export function loadDeployConfig(): DeployConfig {
  try {
    const raw = JSON.parse(readFileSync(DEPLOY_STATE, 'utf-8')) as Partial<DeployConfig>
    return { ...defaultConfig(), ...raw }
  } catch {
    return defaultConfig()
  }
}

export function saveDeployConfig(cfg: DeployConfig): void {
  ensureHome()
  writeFileSync(DEPLOY_STATE, JSON.stringify(cfg, null, 2))
  // Holds the master token.
  chmodSync(DEPLOY_STATE, 0o600)
}

// Everything the core and the daemon need in their environment. This is the one
// place that maps deploy config onto the ELIO_* runtime contract, so a renamed
// variable breaks in exactly one file.
export function runtimeEnv(cfg: DeployConfig): Record<string, string> {
  return {
    ELIO_HOME: elioHome,
    ELIO_DATA_DIR: cfg.dataDir,
    ELIO_NAS_ENABLED: 'true',
    ELIO_NAS_ROOT: cfg.storageRoot,
    ELIO_CORE_PORT: String(cfg.corePort),
    ELIO_WEB_PORT: String(cfg.webPort),
    ELIO_API_TOKEN: cfg.apiToken,
    // Same-origin behind nginx — no cross-origin browser ever talks to the core.
    ELIO_CORS_ORIGIN: cfg.domain ? `https://${cfg.domain}` : '',
    // The gateway is nginx's job on a server deploy; the Node one stays off.
    ELIO_HTTPS_DOMAIN: cfg.domain,
    NODE_ENV: 'production',
    // The login gate, read by the frontend server. All three or none: a
    // half-configured gate is no gate, and the server refuses to guess.
    MURALINK_AUTH_USER: cfg.basicAuthUser,
    MURALINK_AUTH_HASH: cfg.authHash,
    MURALINK_SESSION_SECRET: cfg.sessionSecret,
  }
}

// Public base URL, once exposure is configured.
export function publicUrl(cfg: DeployConfig): string {
  if (!cfg.domain) return `http://127.0.0.1:${cfg.webPort}`
  return cfg.tls === 'none' ? `http://${cfg.domain}` : `https://${cfg.domain}`
}
