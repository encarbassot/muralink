// systemd integration — make the orchester daemon a real service on the box.
//
// Without this the daemon only exists while somebody's SSH session is open, and
// a self-hosted instance that dies on logout is not self-hosted. The unit owns
// nothing but the daemon: the daemon in turn starts core / web-frontend / nas,
// which is why ELIO_AUTOSTART lives in the environment file rather than in a
// unit per service.

import { existsSync } from 'node:fs'
import { run, runPrivileged, which, writePrivileged } from './system'

export const UNIT_NAME = 'muralink-orchesterd.service'
export const UNIT_PATH = `/etc/systemd/system/${UNIT_NAME}`
export const ENV_DIR = '/etc/muralink'
export const ENV_PATH = `${ENV_DIR}/orchester.env`

export interface UnitOptions {
  // Absolute path to the monorepo checkout the daemon runs from.
  repoRoot: string
  // Unprivileged user the daemon runs as. Never root: the daemon spawns the
  // core, and the core reads user files.
  user: string
  group?: string
  // Absolute node binary — resolved at install time so a nvm-managed node
  // (which is not on systemd's PATH) still works.
  nodeBin: string
  // Service ids the daemon brings up on boot.
  autostart: string[]
}

export function renderUnit(opts: UnitOptions): string {
  const group = opts.group ?? opts.user
  return `# Managed by the Muralink orchester deploy wizard.
# Rewritten on every apply — put overrides in
# /etc/systemd/system/${UNIT_NAME}.d/*.conf instead.

[Unit]
Description=Muralink orchester daemon
Documentation=https://mural.ink
# network-online (not just network): the daemon's optional account link dials
# out on boot, and a half-configured interface makes that fail noisily.
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${opts.user}
Group=${group}
WorkingDirectory=${opts.repoRoot}
EnvironmentFile=-${ENV_PATH}
# tsx via --import so the checkout runs from source with no build step, which
# is what makes "git pull && systemctl restart" the whole update story.
ExecStart=${opts.nodeBin} --import tsx ${opts.repoRoot}/packages/orchester/src/daemon-main.ts
Restart=on-failure
RestartSec=5
# The daemon spawns children in their own process groups; kill the whole slice
# so a restart never leaves an orphan holding port 3000/3001.
KillMode=control-group
TimeoutStopSec=30

# Hardening. Deliberately mild: the instance's whole job is to read and write
# the user's own files, so ProtectHome / ReadOnlyPaths would break it.
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ProtectKernelTunables=yes
ProtectControlGroups=yes

StandardOutput=journal
StandardError=journal
SyslogIdentifier=muralink-orchesterd

[Install]
WantedBy=multi-user.target
`
}

// The environment file. Written separately from the unit because it holds the
// API token — the unit is world-readable, this is not.
export function renderEnvFile(vars: Record<string, string>): string {
  const lines = Object.entries(vars)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}=${v}`)
  return `# Managed by the Muralink orchester deploy wizard. Mode 0600 — holds secrets.\n${lines.join('\n')}\n`
}

export interface SystemdStatus {
  available: boolean
  unitInstalled: boolean
  enabled: boolean
  active: boolean
  detail: string
}

export async function systemdStatus(): Promise<SystemdStatus> {
  if (!which('systemctl')) {
    return { available: false, unitInstalled: false, enabled: false, active: false, detail: 'no systemd on this host' }
  }
  const unitInstalled = existsSync(UNIT_PATH)
  const enabled = (await run('systemctl', ['is-enabled', UNIT_NAME])).stdout.trim() === 'enabled'
  const activeRes = await run('systemctl', ['is-active', UNIT_NAME])
  const active = activeRes.stdout.trim() === 'active'
  return {
    available: true,
    unitInstalled,
    enabled,
    active,
    detail: unitInstalled ? `${enabled ? 'enabled' : 'disabled'} / ${activeRes.stdout.trim()}` : 'unit not installed',
  }
}

export interface InstallResult {
  ok: boolean
  message: string
}

// Write unit + env file, reload systemd, enable and start. Idempotent.
export async function installUnit(opts: UnitOptions, env: Record<string, string>): Promise<InstallResult> {
  const mk = await runPrivileged('mkdir', ['-p', ENV_DIR])
  if (!mk.ok) return { ok: false, message: `mkdir ${ENV_DIR}: ${mk.stderr}` }

  const envWritten = await writePrivileged(ENV_PATH, renderEnvFile({ ...env, ELIO_AUTOSTART: opts.autostart.join(',') }), '0600')
  if (!envWritten.ok) return { ok: false, message: `write ${ENV_PATH}: ${envWritten.stderr}` }
  // Readable by the service user, nobody else — it carries ELIO_API_TOKEN.
  await runPrivileged('chown', [`root:${opts.group ?? opts.user}`, ENV_PATH])
  await runPrivileged('chmod', ['0640', ENV_PATH])

  const unitWritten = await writePrivileged(UNIT_PATH, renderUnit(opts), '0644')
  if (!unitWritten.ok) return { ok: false, message: `write ${UNIT_PATH}: ${unitWritten.stderr}` }

  const reload = await runPrivileged('systemctl', ['daemon-reload'])
  if (!reload.ok) return { ok: false, message: `daemon-reload: ${reload.stderr}` }

  const enable = await runPrivileged('systemctl', ['enable', UNIT_NAME])
  if (!enable.ok) return { ok: false, message: `enable: ${enable.stderr}` }

  const restart = await runPrivileged('systemctl', ['restart', UNIT_NAME])
  if (!restart.ok) {
    const log = await journal(40)
    return { ok: false, message: `restart failed: ${restart.stderr}\n${log}` }
  }
  return { ok: true, message: `${UNIT_NAME} enabled and running` }
}

export async function journal(lines = 60): Promise<string> {
  if (!which('journalctl')) return ''
  const res = await run('journalctl', ['-u', UNIT_NAME, '-n', String(lines), '--no-pager'])
  return res.stdout.trim()
}

export async function restartUnit(): Promise<InstallResult> {
  const res = await runPrivileged('systemctl', ['restart', UNIT_NAME])
  return { ok: res.ok, message: res.ok ? 'restarted' : res.stderr }
}
