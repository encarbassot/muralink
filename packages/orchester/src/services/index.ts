// Standard service specs for an elio instance.
// The daemon registers these on boot. CLI / Electron then start/stop them.
//
//   core         — the headless API (platforms/server)
//   web-frontend — static web app + /api proxy to the core
//   nas          — serve a user-chosen folder as instance storage
//   https        — TLS gateway in front of the web-frontend (the public endpoint)
//   electron     — the desktop app (platforms/electronApp); start/stop from here

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Orchester, ServiceConfig } from '../orchester'
import { FrontendServer } from '../frontend-server'
import { HttpsGateway } from '../https-gateway'

// repoRoot = up from packages/orchester/src/services to the monorepo root.
const here = dirname(fileURLToPath(import.meta.url))
export const repoRoot = join(here, '../../../..')

// 'dev' runs electron-vite with HMR (source); 'built' runs the compiled app in out/.
export const ELECTRON_MODE = process.env['ELIO_ELECTRON_MODE'] === 'built' ? 'built' : 'dev'

export const CORE_PORT = Number(process.env['ELIO_CORE_PORT'] ?? 3001)
export const WEB_PORT = Number(process.env['ELIO_WEB_PORT'] ?? 3000)
export const HTTPS_PORT = Number(process.env['ELIO_HTTPS_PORT'] ?? 8443)

const webServer = new FrontendServer()
const httpsGateway = new HttpsGateway()

// Pass the orchester so nas/https can read live config and restart the core.
export function buildDefaultServices(orchester: Orchester): ServiceConfig[] {
  return [
    coreService(),
    webFrontendService(orchester),
    nasService(orchester),
    httpsService(orchester),
    electronService(),
  ]
}

// Read a service's current (possibly user-configured) port/path/domain from the
// live orchester, falling back to a default. Embedded start() closures must use
// this rather than the build-time constants, or `configure` has no effect.
function liveCfg(orchester: Orchester, id: string) {
  return orchester.getStatus().find((s) => s.id === id)
}

function coreService(): ServiceConfig {
  // Run tsx directly (not `npm run start`) so the managed child IS the server
  // process — SIGTERM on stop kills it instead of orphaning it behind npm.
  const tsxBin = join(repoRoot, 'node_modules/.bin/tsx')
  return {
    id: 'core',
    label: 'Core API',
    description: 'Headless instance core — ModuleRegistry + module routers + storage.',
    port: CORE_PORT,
    driver: 'process',
    mode: 'process',
    command: tsxBin,
    args: ['platforms/server/src/index.ts'],
    cwd: repoRoot,
    // ELIO_NAS_ROOT is injected into process.env by the nas service before start.
    env: { PORT: String(CORE_PORT) },
  }
}

// The desktop app. Spawn the electron binary directly (not `npm run dev`) so the
// managed child IS electron — SIGTERM on the process group kills the app and its
// helper/renderer processes instead of orphaning them behind npm.
function electronService(): ServiceConfig {
  const cwd = join(repoRoot, 'platforms/electronApp')
  const dev = ELECTRON_MODE === 'dev'
  // dev: electron-vite dev server + HMR.  built: run the compiled out/ app.
  const command = join(repoRoot, 'node_modules/.bin', dev ? 'electron-vite' : 'electron')
  const args = dev ? ['dev'] : ['.']
  return {
    id: 'electron',
    label: 'Desktop app',
    description: 'macOS Electron file explorer — the desktop instance runtime.',
    driver: 'process',
    mode: 'process',
    command,
    args,
    cwd,
    env: { ELIO_CORE_PORT: String(CORE_PORT) },
  }
}

function webFrontendService(orchester: Orchester): ServiceConfig {
  return {
    id: 'web-frontend',
    label: 'Web frontend',
    description: 'Serves platforms/web/dist and proxies /api to the core.',
    port: WEB_PORT,
    driver: 'web-frontend',
    configurable: true,
    mode: 'embedded',
    async start() {
      const cfg = liveCfg(orchester, 'web-frontend')
      const { port } = await webServer.start({
        servePath: liveCfg(orchester, 'web-frontend')?.path ?? join(repoRoot, 'platforms/web/dist'),
        port: cfg?.port ?? WEB_PORT,
        apiPort: liveCfg(orchester, 'core')?.port ?? CORE_PORT,
      })
      return { port }
    },
    async stop() {
      await webServer.stop()
    },
    currentStatus() {
      return { running: webServer.isRunning(), port: webServer.port }
    },
  }
}

// NAS = the folder this instance hosts. The core serves it at /api/storage when
// ELIO_NAS_ROOT is set, so starting nas injects the configured folder into the
// environment and restarts the core to pick it up.
function nasService(orchester: Orchester): ServiceConfig {
  const coreRunning = () =>
    orchester.getStatus().find((s) => s.id === 'core')?.status === 'running'

  return {
    id: 'nas',
    label: 'NAS storage',
    description: 'Host a folder as this instance’s storage (served at /api/storage).',
    path: process.env['ELIO_NAS_ROOT'] ?? '',
    driver: 'share',
    configurable: true,
    mode: 'embedded',
    async start() {
      const path = orchester.getStatus().find((s) => s.id === 'nas')?.path
      if (!path) throw new Error('configure a folder path first')
      process.env['ELIO_NAS_ROOT'] = path
      process.env['ELIO_NAS_ENABLED'] = 'true'
      if (coreRunning()) await orchester.restart('core')
      return {}
    },
    async stop() {
      delete process.env['ELIO_NAS_ROOT']
      delete process.env['ELIO_NAS_ENABLED']
      if (coreRunning()) await orchester.restart('core')
    },
    currentStatus() {
      return { running: process.env['ELIO_NAS_ENABLED'] === 'true', port: null }
    },
  }
}

function httpsService(orchester: Orchester): ServiceConfig {
  return {
    id: 'https',
    label: 'HTTPS gateway',
    description: 'TLS endpoint in front of the web frontend — the public address.',
    port: HTTPS_PORT,
    domain: 'localhost',
    driver: 'web-frontend',
    configurable: true,
    mode: 'embedded',
    async start() {
      const cfg = liveCfg(orchester, 'https')
      const { port } = await httpsGateway.start({
        port: cfg?.port ?? HTTPS_PORT,
        targetPort: liveCfg(orchester, 'web-frontend')?.port ?? WEB_PORT,
        domain: cfg?.domain ?? process.env['ELIO_HTTPS_DOMAIN'] ?? 'localhost',
      })
      return { port }
    },
    async stop() {
      await httpsGateway.stop()
    },
    currentStatus() {
      return { running: httpsGateway.isRunning(), port: httpsGateway.port }
    },
  }
}
