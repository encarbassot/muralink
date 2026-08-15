// Certificate management — OpenSSL for the offline path, ACME for the public one.
//
// The orchester never implements TLS policy twice. Both paths produce the same
// two things: a fullchain PEM and a key PEM, at paths nginx (or the Node
// https-gateway) points at. Everything downstream only knows those two paths.
//
// Local-first: a box with no internet still gets a working HTTPS endpoint via
// the self-signed path. ACME is the optional upgrade, never a prerequisite.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ACME_WEBROOT, reloadNginx } from './nginx'
import { run, runPrivileged, which } from './system'

// Where the self-signed pair lives when nginx is the terminator. Not ~/.elio:
// nginx workers drop privileges and a cert under a user's home is a permission
// trap the first time someone runs the daemon as a different user.
export const SELF_SIGNED_DIR = '/etc/ssl/muralink'

export interface CertInfo {
  path: string
  exists: boolean
  subject: string | null
  issuer: string | null
  notAfter: string | null
  daysLeft: number | null
  // True when the issuer is the subject — i.e. nobody vouches for it but us.
  selfSigned: boolean
  domains: string[]
}

export interface CertPair {
  certPath: string
  keyPath: string
}

// Let's Encrypt's canonical layout. certbot maintains `live/` as symlinks into
// `archive/`, so these paths stay valid across renewals — never copy the PEMs.
export function acmePaths(domain: string): CertPair {
  return {
    certPath: `/etc/letsencrypt/live/${domain}/fullchain.pem`,
    keyPath: `/etc/letsencrypt/live/${domain}/privkey.pem`,
  }
}

export function selfSignedPaths(domain: string): CertPair {
  return {
    certPath: join(SELF_SIGNED_DIR, `${domain}.crt`),
    keyPath: join(SELF_SIGNED_DIR, `${domain}.key`),
  }
}

// Read a certificate with `openssl x509`. Works on a PEM we cannot open as the
// current user by falling back to a privileged read.
export async function certInfo(certPath: string): Promise<CertInfo> {
  const empty: CertInfo = {
    path: certPath, exists: false, subject: null, issuer: null,
    notAfter: null, daysLeft: null, selfSigned: false, domains: [],
  }
  const args = ['x509', '-in', certPath, '-noout', '-subject', '-issuer', '-enddate', '-ext', 'subjectAltName']
  let res = await run('openssl', args)
  if (!res.ok) res = await runPrivileged('openssl', args)
  if (!res.ok) return empty

  const out = res.stdout
  const subject = /^subject=\s*(.+)$/m.exec(out)?.[1]?.trim() ?? null
  const issuer = /^issuer=\s*(.+)$/m.exec(out)?.[1]?.trim() ?? null
  const notAfterRaw = /^notAfter=(.+)$/m.exec(out)?.[1]?.trim() ?? null
  const notAfter = notAfterRaw ? new Date(notAfterRaw).toISOString() : null
  const daysLeft = notAfter
    ? Math.floor((new Date(notAfter).getTime() - Date.now()) / 86_400_000)
    : null
  const domains = [...out.matchAll(/DNS:([^,\s]+)/g)].map((m) => m[1]!)

  return {
    path: certPath,
    exists: true,
    subject,
    issuer,
    notAfter,
    daysLeft,
    selfSigned: Boolean(subject && issuer && subject === issuer),
    domains,
  }
}

export interface IssueResult {
  ok: boolean
  pair: CertPair | null
  message: string
}

// Everything under /etc/letsencrypt/live is root-only (drwx------), and this
// wizard runs unprivileged. `existsSync` on those paths answers "no" for a
// file that is plainly there, so a certificate certbot just issued gets
// reported as a failed step. Ask with the same privileges that wrote it.
async function existsPrivileged(path: string): Promise<boolean> {
  const res = await runPrivileged('test', ['-f', path])
  return res.ok
}

// Generate (or keep) a self-signed pair for `domain`. Idempotent: an existing
// pair with more than a week of life is reused, so re-running the wizard step
// does not invalidate the cert every browser on the LAN just accepted.
export async function ensureSelfSigned(domain: string, altNames: string[] = []): Promise<IssueResult> {
  const pair = selfSignedPaths(domain)
  if ((await existsPrivileged(pair.certPath)) && (await existsPrivileged(pair.keyPath))) {
    const info = await certInfo(pair.certPath)
    if ((info.daysLeft ?? 0) > 7) {
      return { ok: true, pair, message: `reusing self-signed cert (${info.daysLeft}d left)` }
    }
  }

  const mk = await runPrivileged('mkdir', ['-p', SELF_SIGNED_DIR])
  if (!mk.ok) return { ok: false, pair: null, message: `mkdir ${SELF_SIGNED_DIR}: ${mk.stderr}` }

  const sans = ['DNS:' + domain, 'DNS:localhost', 'IP:127.0.0.1', ...altNames.map(sanFor)]
  const res = await runPrivileged('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256',
    '-keyout', pair.keyPath,
    '-out', pair.certPath,
    // 825 days is the maximum a modern browser will accept for a leaf cert.
    '-days', '825',
    '-subj', `/CN=${domain}`,
    '-addext', `subjectAltName=${sans.join(',')}`,
  ])
  if (!res.ok) return { ok: false, pair: null, message: `openssl req: ${res.stderr}` }

  await runPrivileged('chmod', ['0600', pair.keyPath])
  await runPrivileged('chmod', ['0644', pair.certPath])
  return { ok: true, pair, message: `self-signed cert issued for ${domain}` }
}

function sanFor(name: string): string {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(name) ? `IP:${name}` : `DNS:${name}`
}

export interface AcmeOptions {
  domain: string
  // Contact address for expiry notices. Required by the ACME account.
  email: string
  aliases?: string[]
  // Hit the staging CA instead — no rate limits, cert is untrusted. The wizard
  // offers this after a real issuance fails, so the user can iterate.
  staging?: boolean
}

// A name a public CA could plausibly issue for: a dotted FQDN that is not an
// IP address. Deliberately not a validity check — DNS and the challenge decide
// that. This only filters out the names that make the request fail outright.
export function isPubliclyCertifiable(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed || !trimmed.includes('.')) return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) return false // IPv4
  if (trimmed.includes(':')) return false // IPv6
  if (trimmed.endsWith('.local')) return false // mDNS, not public
  return true
}

// Issue via certbot's webroot plugin. Webroot (not --nginx) on purpose: the
// nginx plugin rewrites our managed site file behind our back, and this file is
// the authority on what that site contains.
export async function issueAcme(opts: AcmeOptions): Promise<IssueResult> {
  if (!which('certbot')) {
    return { ok: false, pair: null, message: 'certbot is not installed' }
  }
  // Aliases exist so nginx answers to the LAN address and the bare hostname
  // too. A public CA can validate neither: Let's Encrypt refuses bare IPs
  // outright, and a single-label name like `gamma` has no public DNS to prove.
  // Including them does not weaken the certificate — it fails the whole request,
  // taking the valid domain down with it. nginx keeps serving them over HTTP.
  const certifiable = (opts.aliases ?? []).filter(isPubliclyCertifiable)
  const domains = [opts.domain, ...certifiable].flatMap((d) => ['-d', d])
  const args = [
    'certonly', '--webroot', '-w', ACME_WEBROOT,
    ...domains,
    '--email', opts.email,
    '--agree-tos', '--no-eff-email',
    '--non-interactive',
    // Reuse the existing account/cert lineage rather than failing when the
    // wizard is re-run after a partial deploy.
    '--keep-until-expiring',
  ]
  if (opts.staging) args.push('--staging')

  const res = await runPrivileged('certbot', args, { timeoutMs: 180_000 })
  const pair = acmePaths(opts.domain)
  if (!res.ok || !(await existsPrivileged(pair.certPath))) {
    return { ok: false, pair: null, message: `certbot failed:\n${res.stdout}\n${res.stderr}`.trim() }
  }
  return { ok: true, pair, message: `certificate issued for ${opts.domain}` }
}

export interface RenewalStatus {
  // certbot's own timer/cron is what renews; we only report on it.
  automated: boolean
  mechanism: 'systemd-timer' | 'cron' | 'none'
  detail: string
}

export async function renewalStatus(): Promise<RenewalStatus> {
  if (which('systemctl')) {
    const timer = await run('systemctl', ['is-enabled', 'certbot.timer'])
    const state = timer.stdout.trim()
    if (state === 'enabled' || state === 'static') {
      return { automated: true, mechanism: 'systemd-timer', detail: `certbot.timer ${state}` }
    }
  }
  if (existsSync('/etc/cron.d/certbot')) {
    return { automated: true, mechanism: 'cron', detail: '/etc/cron.d/certbot' }
  }
  return { automated: false, mechanism: 'none', detail: 'no renewal timer found — renew by hand' }
}

// Install a deploy hook so a renewal reloads nginx. certbot's packaged hooks
// already do this on Debian; writing our own is harmless and makes a
// hand-built certbot behave the same.
export async function installRenewHook(): Promise<{ ok: boolean; message: string }> {
  const dir = '/etc/letsencrypt/renewal-hooks/deploy'
  const mk = await runPrivileged('mkdir', ['-p', dir])
  if (!mk.ok) return { ok: false, message: mk.stderr }
  const hook = `${dir}/muralink-reload-nginx.sh`
  const script = '#!/bin/sh\n# Managed by the Muralink orchester.\nnginx -t && systemctl reload nginx\n'
  const written = await runPrivileged('tee', [hook], { input: script })
  if (!written.ok) return { ok: false, message: written.stderr }
  const chmod = await runPrivileged('chmod', ['0755', hook])
  return { ok: chmod.ok, message: chmod.ok ? `renew hook at ${hook}` : chmod.stderr }
}

// Force a renewal check now. Used by the wizard's "verify" step and by an
// operator poking at a cert that is about to lapse.
export async function renewNow(dryRun = false): Promise<{ ok: boolean; message: string }> {
  if (!which('certbot')) return { ok: false, message: 'certbot is not installed' }
  const res = await runPrivileged('certbot', dryRun ? ['renew', '--dry-run'] : ['renew'], {
    timeoutMs: 180_000,
  })
  if (res.ok && !dryRun) await reloadNginx()
  return { ok: res.ok, message: res.ok ? res.stdout.trim() : `${res.stdout}\n${res.stderr}`.trim() }
}
