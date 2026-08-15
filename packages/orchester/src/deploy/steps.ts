// The deploy wizard's step machine.
//
// One declarative list, no UI. Each step knows how to *check* itself (cheap,
// idempotent, safe to run at any moment) and most know how to *apply* themselves.
// The CLI renders this list; a future web wizard renders the same list. That
// separation is the whole point: the sequence a self-hoster walks through is
// data, not a screen.
//
// Rules every step obeys:
//   - check() never mutates the host.
//   - apply() is idempotent — running the wizard twice is a supported thing.
//   - a step that cannot proceed reports 'fail' with the real stderr, never a
//     summary. The operator is on an SSH session and needs the actual error.

import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  dnsA, freeBytes, hostInfo, installCmd, portFree, portHolder, publicIp,
  run, runPrivileged, which,
} from './system'
import {
  ACME_WEBROOT, applySite, htpasswdPath, nginxStatus, writeHtpasswd,
} from './nginx'
import {
  acmePaths, certInfo, ensureSelfSigned, installRenewHook, issueAcme,
  renewalStatus, selfSignedPaths,
} from './certs'
import { installUnit, journal, systemdStatus } from './systemd'
import { publicUrl, runtimeEnv, type DeployConfig } from './config'

export type StepState = 'ok' | 'todo' | 'warn' | 'fail'

export interface StepReport {
  state: StepState
  detail: string
  // Actionable lines shown under the step. Facts, not prose.
  hints?: string[]
}

export interface StepContext {
  cfg: DeployConfig
  // Streams progress out of a long apply() so the TUI is not a frozen spinner.
  log: (line: string) => void
  // Set during apply for steps that need a secret the config refuses to store.
  secrets: { basicAuthPassword?: string }
}

export interface DeployStep {
  id: string
  title: string
  description: string
  check: (ctx: StepContext) => Promise<StepReport>
  apply?: (ctx: StepContext) => Promise<StepReport>
  // Steps the operator fills in by hand (the identity form); the wizard shows
  // them but never offers an "apply".
  manual?: boolean
}

const ok = (detail: string, hints?: string[]): StepReport => ({ state: 'ok', detail, hints })
const todo = (detail: string, hints?: string[]): StepReport => ({ state: 'todo', detail, hints })
const warn = (detail: string, hints?: string[]): StepReport => ({ state: 'warn', detail, hints })
const fail = (detail: string, hints?: string[]): StepReport => ({ state: 'fail', detail, hints })

const REQUIRED_NODE_MAJOR = 20

// ── 1. preflight ─────────────────────────────────────────────────────────────

const preflight: DeployStep = {
  id: 'preflight',
  title: 'Host preflight',
  description: 'OS, node, privileges, systemd and free disk on this machine.',
  async check(ctx) {
    const host = hostInfo()
    const hints: string[] = [
      `${host.prettyName} (${host.arch})`,
      `node ${host.nodeVersion}`,
    ]
    const problems: string[] = []

    const major = Number(host.nodeVersion.split('.')[0])
    if (!Number.isFinite(major) || major < REQUIRED_NODE_MAJOR) {
      problems.push(`node ${REQUIRED_NODE_MAJOR}+ required, found ${host.nodeVersion}`)
    }
    if (host.platform !== 'linux') {
      hints.push('not Linux — systemd and nginx steps will not apply')
    }
    if (!host.hasSystemd) problems.push('systemd not found — the daemon cannot be installed as a service')

    // Passwordless sudo. Everything privileged in this wizard uses `sudo -n`,
    // so a box that prompts would hang a non-interactive apply forever.
    const sudo = await runPrivileged('true', [])
    if (!sudo.ok) {
      problems.push('passwordless sudo unavailable (`sudo -n true` failed)')
      hints.push('fix: echo "$USER ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/muralink')
    } else {
      hints.push('sudo -n: ok')
    }

    const free = await freeBytes(ctx.cfg.repoRoot)
    if (free !== null) {
      const gb = free / 1e9
      hints.push(`free disk at ${ctx.cfg.repoRoot}: ${gb.toFixed(1)} GB`)
      // node_modules for this monorepo plus a web build is comfortably over 2 GB.
      if (gb < 3) problems.push(`only ${gb.toFixed(1)} GB free — the build needs ~3 GB`)
    }

    if (problems.length) return fail(problems.join('; '), hints)
    return ok('host is ready', hints)
  },
}

// ── 2. identity ──────────────────────────────────────────────────────────────

const identity: DeployStep = {
  id: 'identity',
  title: 'Instance identity',
  description: 'Domain, admin email, service user and where data lives.',
  manual: true,
  async check(ctx) {
    const { cfg } = ctx
    const missing: string[] = []
    if (!cfg.domain) missing.push('domain')
    if (!cfg.adminEmail && cfg.tls === 'acme') missing.push('adminEmail (required by ACME)')
    if (!cfg.serviceUser) missing.push('serviceUser')
    if (!cfg.storageRoot) missing.push('storageRoot')
    if (!cfg.apiToken) missing.push('apiToken')

    const hints = [
      `domain      ${cfg.domain || '—'}`,
      `public url  ${publicUrl(cfg)}`,
      `user        ${cfg.serviceUser}`,
      `repo        ${cfg.repoRoot}`,
      `data        ${cfg.dataDir}`,
      `storage     ${cfg.storageRoot}`,
      `exposure    ${cfg.webServer} / tls ${cfg.tls}`,
      `auth gate   ${cfg.basicAuthUser ? `basic auth as "${cfg.basicAuthUser}"` : 'NONE — anyone reaching this address owns the instance'}`,
    ]
    if (missing.length) return todo(`missing: ${missing.join(', ')}`, hints)
    if (!cfg.basicAuthUser) return warn('configured, but with no auth gate', hints)
    return ok('configured', hints)
  },
}

// ── 3. system packages ───────────────────────────────────────────────────────

// certbot only matters on the ACME path; openssl is needed on every path
// (self-signed certs, htpasswd fallback). git is how the box updates itself.
function requiredPackages(cfg: DeployConfig): { bin: string; pkg: string; optional?: boolean }[] {
  const list = [
    { bin: 'openssl', pkg: 'openssl' },
    { bin: 'git', pkg: 'git' },
    // better-sqlite3 ships prebuilds, but a fresh arm box often has to compile.
    { bin: 'cc', pkg: 'build-essential', optional: true },
  ]
  if (cfg.webServer === 'nginx') list.push({ bin: 'nginx', pkg: 'nginx' })
  if (cfg.tls === 'acme') list.push({ bin: 'certbot', pkg: 'certbot' })
  return list
}

const packages: DeployStep = {
  id: 'packages',
  title: 'System packages',
  description: 'nginx, certbot, openssl, git and a compiler for native modules.',
  async check(ctx) {
    const needed = requiredPackages(ctx.cfg)
    const missing = needed.filter((p) => !which(p.bin))
    const hints = needed.map((p) => `${which(p.bin) ? '·' : '✗'} ${p.bin}`)
    const hard = missing.filter((p) => !p.optional)
    if (hard.length) return todo(`missing: ${hard.map((p) => p.pkg).join(', ')}`, hints)
    if (missing.length) return warn(`optional missing: ${missing.map((p) => p.pkg).join(', ')}`, hints)
    return ok('all present', hints)
  },
  async apply(ctx) {
    const host = hostInfo()
    const missing = requiredPackages(ctx.cfg).filter((p) => !which(p.bin))
    if (!missing.length) return ok('nothing to install')

    const cmd = installCmd(host.family, missing.map((p) => p.pkg))
    if (!cmd) return fail(`unknown package manager for "${host.family}" — install by hand: ${missing.map((p) => p.pkg).join(' ')}`)

    if (host.family === 'debian') {
      ctx.log('apt-get update…')
      await runPrivileged('apt-get', ['update'], { timeoutMs: 300_000, env: { DEBIAN_FRONTEND: 'noninteractive' } })
    }
    ctx.log(`installing: ${missing.map((p) => p.pkg).join(' ')}`)
    const res = await runPrivileged(cmd.cmd, cmd.args, {
      timeoutMs: 600_000,
      env: { DEBIAN_FRONTEND: 'noninteractive' },
    })
    if (!res.ok) return fail(`install failed:\n${res.stderr.trim()}`)
    return ok(`installed ${missing.map((p) => p.pkg).join(', ')}`)
  },
}

// ── 4. network ───────────────────────────────────────────────────────────────

const network: DeployStep = {
  id: 'network',
  title: 'Ports and DNS',
  description: 'Ports 80/443 reachable and the domain pointing at this machine.',
  async check(ctx) {
    const { cfg } = ctx
    const hints: string[] = []
    const problems: string[] = []
    const warnings: string[] = []

    const nginx = await nginxStatus()
    for (const port of [80, 443]) {
      const free = await portFree(port)
      if (free) {
        hints.push(`:${port} free`)
      } else if (nginx.running) {
        // nginx holding them is the expected end state, not a conflict.
        hints.push(`:${port} held by nginx`)
      } else {
        const holder = await portHolder(port)
        problems.push(`:${port} is taken${holder ? ` by ${holder}` : ''}`)
      }
    }

    if (cfg.domain) {
      const a = await dnsA(cfg.domain)
      const mine = await publicIp()
      hints.push(`${cfg.domain} → ${a.length ? a.join(', ') : 'NXDOMAIN'}`)
      if (mine) hints.push(`this machine's public IP → ${mine}`)

      if (!a.length) {
        problems.push(`${cfg.domain} does not resolve`)
      } else if (mine && !a.includes(mine)) {
        // ACME HTTP-01 validates against whatever the A record points at, so a
        // mismatch is a hard blocker for issuance and only a warning otherwise.
        const msg = `${cfg.domain} resolves to ${a.join(', ')} but this machine is ${mine}`
        if (cfg.tls === 'acme') problems.push(`${msg} — ACME HTTP-01 will validate against the wrong host`)
        else warnings.push(msg)
      } else if (!mine) {
        warnings.push('could not determine this machine\'s public IP (offline?) — DNS not verified')
      }
    }

    if (problems.length) return fail(problems.join('; '), hints)
    if (warnings.length) return warn(warnings.join('; '), hints)
    return ok('ports and DNS look right', hints)
  },
}

// ── 5. source checkout ───────────────────────────────────────────────────────

// The step that lets a bare machine become an instance. Everything downstream
// assumes repoRoot holds the monorepo; this is what puts it there.
//
// A checkout that is not a git repo is left alone and reported, never
// overwritten: that is the shape of a developer running the wizard against
// their own working copy, and clobbering it would destroy uncommitted work.
const source: DeployStep = {
  id: 'source',
  title: 'Source checkout',
  description: 'Clone the monorepo from GitHub, or fast-forward the existing checkout.',
  async check(ctx) {
    const { repoRoot, repoUrl, repoBranch } = ctx.cfg
    if (!existsSync(repoRoot)) return todo(`not cloned — ${repoUrl} (${repoBranch}) will land at ${repoRoot}`)
    if (!existsSync(join(repoRoot, '.git'))) {
      if (!existsSync(join(repoRoot, 'package.json'))) {
        return fail(`${repoRoot} exists but is neither a git checkout nor a monorepo`)
      }
      return warn('local checkout, not managed by git — the wizard will not touch it', [`repo ${repoRoot}`])
    }

    const head = await run('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot })
    const branch = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot })
    const dirty = await run('git', ['status', '--porcelain'], { cwd: repoRoot })
    // The real remote, not the configured one: a checkout wired to somewhere
    // else is exactly the surprise this step exists to surface.
    const remote = await run('git', ['remote', 'get-url', 'origin'], { cwd: repoRoot })
    const actual = remote.stdout.trim()
    const hints = [
      `branch ${branch.stdout.trim() || '?'} at ${head.stdout.trim() || '?'}`,
      `origin ${actual || '— none'}`,
    ]
    if (actual && actual !== repoUrl) {
      hints.push(`configured repo url differs: ${repoUrl}`)
    }
    if (branch.ok && branch.stdout.trim() && branch.stdout.trim() !== repoBranch) {
      hints.push(`configured branch differs: ${repoBranch}`)
    }
    if (dirty.ok && dirty.stdout.trim()) {
      return warn('checkout has local changes — update would not be a fast-forward', hints)
    }
    return ok('checkout present', hints)
  },
  async apply(ctx) {
    const { repoRoot, repoUrl, repoBranch } = ctx.cfg

    if (!existsSync(repoRoot)) {
      ctx.log(`git clone ${repoUrl} (${repoBranch})…`)
      const res = await run('git', ['clone', '--branch', repoBranch, repoUrl, repoRoot], {
        timeoutMs: 1_800_000,
      })
      if (!res.ok) return fail(`clone failed:\n${res.stderr.trim().slice(-4000)}`)
      return ok(`cloned into ${repoRoot}`)
    }

    if (!existsSync(join(repoRoot, '.git'))) {
      return warn('not a git checkout — left untouched')
    }

    // Fast-forward only. A deploy that silently merges or rebases is a deploy
    // that can ship something nobody wrote.
    ctx.log('git fetch…')
    const fetched = await run('git', ['fetch', '--prune', 'origin'], { cwd: repoRoot, timeoutMs: 600_000 })
    if (!fetched.ok) return fail(`fetch failed:\n${fetched.stderr.trim().slice(-4000)}`)

    const co = await run('git', ['checkout', repoBranch], { cwd: repoRoot })
    if (!co.ok) return fail(`checkout ${repoBranch} failed:\n${co.stderr.trim().slice(-4000)}`)

    const pulled = await run('git', ['merge', '--ff-only', `origin/${repoBranch}`], { cwd: repoRoot })
    if (!pulled.ok) {
      return fail(`not a fast-forward — resolve by hand on the box:\n${pulled.stderr.trim().slice(-4000)}`)
    }
    const head = await run('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot })
    return ok(`updated to ${head.stdout.trim()}`)
  },
}

// ── 6. workspace dependencies ────────────────────────────────────────────────

const dependencies: DeployStep = {
  id: 'dependencies',
  title: 'Workspace dependencies',
  description: 'npm install across the monorepo (needed to run and to build).',
  async check(ctx) {
    const marker = join(ctx.cfg.repoRoot, 'node_modules/.bin/tsx')
    if (!existsSync(marker)) return todo('node_modules missing or incomplete')
    const sqlite = join(ctx.cfg.repoRoot, 'node_modules/better-sqlite3')
    if (!existsSync(sqlite)) return todo('better-sqlite3 not installed — the core cannot open its database')
    return ok('installed', [`tsx at ${marker}`])
  },
  async apply(ctx) {
    ctx.log('npm install (this takes a few minutes on a fresh box)…')
    // `install`, not `ci`: the workspace ships no committed lockfile guarantee
    // across the two repo cut points, and `ci` deletes node_modules on every
    // re-run of the wizard for no gain.
    const res = await run('npm', ['install', '--no-audit', '--no-fund'], {
      cwd: ctx.cfg.repoRoot,
      timeoutMs: 1_800_000,
    })
    if (!res.ok) return fail(`npm install failed:\n${res.stderr.trim().slice(-4000)}`)
    return ok('dependencies installed')
  },
}

// ── 7. frontend build ────────────────────────────────────────────────────────

const buildWeb: DeployStep = {
  id: 'build-web',
  title: 'Build the frontend',
  description: 'Compile platforms/web into the dist the frontend server serves.',
  async check(ctx) {
    const dist = join(ctx.cfg.repoRoot, 'platforms/web/dist/index.html')
    if (!existsSync(dist)) return todo('no build yet')
    const built = statSync(dist).mtime
    return ok(`built ${built.toISOString()}`, [`dist at ${join(ctx.cfg.repoRoot, 'platforms/web/dist')}`])
  },
  async apply(ctx) {
    ctx.log('vite build…')
    // vite directly rather than `npm run build`, which also runs `tsc -b`.
    // Type errors are a CI concern; they must not be able to block a deploy of
    // code that runs. The typecheck script stays available for that job.
    const vite = join(ctx.cfg.repoRoot, 'node_modules/.bin/vite')
    if (!existsSync(vite)) return fail('vite not found — run the dependencies step first')
    const res = await run(vite, ['build'], {
      cwd: join(ctx.cfg.repoRoot, 'platforms/web'),
      timeoutMs: 1_200_000,
      // The bundle must not carry a token: nginx injects the real one upstream.
      env: { NODE_ENV: 'production', VITE_HARDSALON_TOKEN: '' },
    })
    if (!res.ok) return fail(`build failed:\n${(res.stderr || res.stdout).trim().slice(-4000)}`)
    return ok('frontend built')
  },
}

// ── 8. data + storage directories ────────────────────────────────────────────

const storage: DeployStep = {
  id: 'storage',
  title: 'Data and storage folders',
  description: 'Create the database directory and the folder served as storage.',
  async check(ctx) {
    const { dataDir, storageRoot, serviceUser } = ctx.cfg
    const missing = [dataDir, storageRoot].filter((p) => !existsSync(p))
    const hints = [`data     ${dataDir}`, `storage  ${storageRoot}`]
    if (missing.length) return todo(`missing: ${missing.join(', ')}`, hints)

    // Owned by the service user, or the daemon cannot write its own database.
    const owner = await run('stat', ['-c', '%U', storageRoot])
    if (owner.ok && owner.stdout.trim() !== serviceUser) {
      return warn(`${storageRoot} is owned by ${owner.stdout.trim()}, not ${serviceUser}`, hints)
    }
    const free = await freeBytes(storageRoot)
    if (free !== null) hints.push(`free on the storage volume: ${(free / 1e9).toFixed(1)} GB`)
    return ok('ready', hints)
  },
  async apply(ctx) {
    const { dataDir, storageRoot, serviceUser } = ctx.cfg
    for (const dir of [dataDir, storageRoot]) {
      const mk = await runPrivileged('mkdir', ['-p', dir])
      if (!mk.ok) return fail(`mkdir ${dir}: ${mk.stderr}`)
      const own = await runPrivileged('chown', ['-R', `${serviceUser}:${serviceUser}`, dir])
      if (!own.ok) return fail(`chown ${dir}: ${own.stderr}`)
    }
    // 0700 on storage: these are the user's files and the box may have other
    // logins. The core reads them as the service user, nginx never touches them.
    await runPrivileged('chmod', ['0700', storageRoot])
    return ok(`created ${dataDir} and ${storageRoot}`)
  },
}

// ── 9. daemon as a service ───────────────────────────────────────────────────

const service: DeployStep = {
  id: 'service',
  title: 'Orchester service',
  description: 'Install the systemd unit so the instance survives reboots.',
  async check(ctx) {
    const st = await systemdStatus()
    if (!st.available) return fail('no systemd on this host')
    if (!st.unitInstalled) return todo('unit not installed', [`will write /etc/systemd/system/muralink-orchesterd.service`])
    if (!st.active) return fail(`unit installed but not running (${st.detail})`, (await journal(20)).split('\n').slice(-8))
    if (!st.enabled) return warn('running but not enabled — it will not come back after a reboot')
    return ok(st.detail, [`user ${ctx.cfg.serviceUser}`, `repo ${ctx.cfg.repoRoot}`])
  },
  async apply(ctx) {
    const nodeBin = which('node')
    if (!nodeBin) return fail('node not found on PATH')
    ctx.log('writing unit + environment file…')
    const res = await installUnit(
      {
        repoRoot: ctx.cfg.repoRoot,
        user: ctx.cfg.serviceUser,
        nodeBin,
        // web-frontend last: it is the thing the outside world hits, so it
        // should not accept traffic before the core and storage are up.
        autostart: ['nas', 'core', 'web-frontend'],
      },
      runtimeEnv(ctx.cfg),
    )
    if (!res.ok) return fail(res.message)
    // Give the daemon a moment to bring the autostart set up before the next
    // step's health check runs against it.
    await new Promise((r) => setTimeout(r, 4000))
    return ok(res.message)
  },
}

// ── 10. database ──────────────────────────────────────────────────────────────

const database: DeployStep = {
  id: 'database',
  title: 'Database',
  description: 'The core opened its sqlite file and answers /health.',
  async check(ctx) {
    const { cfg } = ctx
    const dbFile = join(cfg.dataDir, process.env['ELIO_DB_NAME'] ?? 'elio-instance.db')
    const hints: string[] = [`db ${dbFile}`]

    type Health = { ok?: boolean; instance?: string; modules?: string[] }
    let health: Health | null = null
    try {
      const res = await fetch(`http://127.0.0.1:${cfg.corePort}/health`, {
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) health = (await res.json()) as Health
    } catch {
      // Core down — reported below with the db-file fact for context.
    }

    if (!health) {
      return fail(`core not answering on :${cfg.corePort}`, [
        ...hints,
        existsSync(dbFile) ? 'the database file exists, so this is a process problem' : 'no database file yet either',
        'journalctl -u muralink-orchesterd -n 50',
      ])
    }
    if (!existsSync(dbFile)) {
      return warn('core is up but the database is not where the config says', [
        ...hints,
        'check ELIO_DATA_DIR in /etc/muralink/orchester.env',
      ])
    }
    const size = statSync(dbFile).size
    hints.push(`${(size / 1024).toFixed(0)} KB`)
    hints.push(`modules: ${(health.modules ?? []).join(', ') || 'none installed'}`)
    return ok(`core healthy (instance "${health.instance}")`, hints)
  },
}

// ── 11. web server ───────────────────────────────────────────────────────────

const webserver: DeployStep = {
  id: 'webserver',
  title: 'Web server (nginx)',
  description: 'Public endpoint, auth gate, and the reverse proxy to the frontend.',
  async check(ctx) {
    const { cfg } = ctx
    if (cfg.webServer === 'none') return ok('skipped — no web server integration selected')
    const st = await nginxStatus()
    const hints = [
      st.version ? `nginx ${st.version}` : 'nginx not installed',
      `site ${st.sitePath}`,
      existsSync(htpasswdPath()) ? `auth gate ${htpasswdPath()}` : 'auth gate NOT configured',
    ]
    if (!st.installed) return todo('nginx not installed', hints)
    if (!st.siteEnabled) return todo('site not written', hints)
    if (st.configValid === false) return fail('nginx -t rejects the current config', hints)
    if (!st.running) return fail('nginx is not running', hints)
    if (!existsSync(htpasswdPath()) && cfg.basicAuthUser) return todo('site up but the auth gate is missing', hints)
    return ok('site enabled and nginx reloaded', hints)
  },
  async apply(ctx) {
    const { cfg } = ctx
    if (cfg.webServer === 'none') return ok('skipped')

    // The gate first: a site that comes up ungated, even for a few seconds, is
    // a public instance with no password on the open internet.
    if (cfg.basicAuthUser) {
      const pw = ctx.secrets.basicAuthPassword
      if (!pw && !existsSync(htpasswdPath())) {
        return fail('set a password for the auth gate before applying this step')
      }
      if (pw) {
        ctx.log(`writing auth gate for "${cfg.basicAuthUser}"…`)
        const gate = await writeHtpasswd(htpasswdPath(), cfg.basicAuthUser, pw)
        if (!gate.ok) return fail(gate.message)
      }
    }

    // Certificates are issued in the next step and HTTP-01 needs :80 answering,
    // so the site always starts in plain-HTTP mode. The tls step promotes it.
    const certs = cfg.tls === 'acme' ? acmePaths(cfg.domain) : selfSignedPaths(cfg.domain)
    const haveCert = existsSync(certs.certPath) && existsSync(certs.keyPath)
    const mode = cfg.tls !== 'none' && haveCert ? 'https' : 'http'

    ctx.log(`applying site in ${mode} mode…`)
    const res = await applySite({
      domain: cfg.domain,
      aliases: cfg.aliases,
      upstreamPort: cfg.webPort,
      mode,
      certPath: certs.certPath,
      keyPath: certs.keyPath,
      htpasswdPath: cfg.basicAuthUser ? htpasswdPath() : undefined,
      apiToken: cfg.basicAuthUser ? cfg.apiToken : undefined,
    })
    if (!res.ok) return fail(res.message)
    return ok(res.message, [`ACME webroot ${ACME_WEBROOT}`])
  },
}

// ── 12. TLS ──────────────────────────────────────────────────────────────────

const tls: DeployStep = {
  id: 'tls',
  title: 'TLS certificate',
  description: 'Issue the certificate and promote the site to HTTPS.',
  async check(ctx) {
    const { cfg } = ctx
    if (cfg.tls === 'none') return warn('TLS disabled — traffic to this instance is in the clear')

    const paths = cfg.tls === 'acme' ? acmePaths(cfg.domain) : selfSignedPaths(cfg.domain)
    const info = await certInfo(paths.certPath)
    if (!info.exists) return todo('no certificate yet', [`will write ${paths.certPath}`])

    const hints = [
      `issuer  ${info.issuer ?? '?'}`,
      `expires ${info.notAfter ?? '?'} (${info.daysLeft ?? '?'} days)`,
      `names   ${info.domains.join(', ') || '—'}`,
    ]
    const renew = await renewalStatus()
    hints.push(`renewal ${renew.detail}`)

    if ((info.daysLeft ?? 0) <= 0) return fail('certificate has expired', hints)
    if ((info.daysLeft ?? 0) < 15) return warn(`certificate expires in ${info.daysLeft} days`, hints)
    if (cfg.tls === 'acme' && info.selfSigned) return todo('still on the self-signed cert', hints)
    if (cfg.tls === 'acme' && !renew.automated) return warn('no automatic renewal configured', hints)

    const st = await nginxStatus()
    if (st.installed && st.siteEnabled) {
      // A cert that exists but is not referenced is a cert nobody is using.
      const site = await runPrivileged('grep', ['-c', 'listen      443', st.sitePath])
      if (site.stdout.trim() === '0') return todo('certificate ready — site still on plain HTTP', hints)
    }
    return ok(info.selfSigned ? 'self-signed certificate in place' : 'certificate valid', hints)
  },
  async apply(ctx) {
    const { cfg } = ctx
    if (cfg.tls === 'none') return ok('skipped')

    if (cfg.tls === 'self-signed') {
      const res = await ensureSelfSigned(cfg.domain, cfg.aliases)
      if (!res.ok) return fail(res.message)
      ctx.log(res.message)
    } else {
      if (!cfg.adminEmail) return fail('ACME needs an admin email')
      ctx.log(`requesting a certificate for ${cfg.domain} (HTTP-01 via ${ACME_WEBROOT})…`)
      const res = await issueAcme({ domain: cfg.domain, email: cfg.adminEmail, aliases: cfg.aliases })
      if (!res.ok) {
        return fail(res.message, [
          'HTTP-01 needs :80 to reach THIS machine from the internet',
          `check that ${cfg.domain} resolves to this box and that the router forwards :80`,
        ])
      }
      ctx.log(res.message)
      const hook = await installRenewHook()
      ctx.log(hook.message)
    }

    // Promote the site now that the PEMs exist.
    if (cfg.webServer === 'nginx') {
      const paths = cfg.tls === 'acme' ? acmePaths(cfg.domain) : selfSignedPaths(cfg.domain)
      ctx.log('promoting the nginx site to HTTPS…')
      const site = await applySite({
        domain: cfg.domain,
        aliases: cfg.aliases,
        upstreamPort: cfg.webPort,
        mode: 'https',
        certPath: paths.certPath,
        keyPath: paths.keyPath,
        htpasswdPath: cfg.basicAuthUser ? htpasswdPath() : undefined,
        apiToken: cfg.basicAuthUser ? cfg.apiToken : undefined,
      })
      if (!site.ok) return fail(site.message)
    }
    return ok('TLS in place')
  },
}

// ── 13. verify ───────────────────────────────────────────────────────────────

const verify: DeployStep = {
  id: 'verify',
  title: 'End-to-end check',
  description: 'Hit the public address the way a browser would.',
  async check(ctx) {
    const { cfg } = ctx
    const base = publicUrl(cfg)
    const hints: string[] = [`base ${base}`]
    const problems: string[] = []

    // curl, not fetch: a self-signed cert must be testable, and only curl lets
    // us say "insecure but reachable" as a distinct outcome.
    const auth = cfg.basicAuthUser && ctx.secrets.basicAuthPassword
      ? ['-u', `${cfg.basicAuthUser}:${ctx.secrets.basicAuthPassword}`]
      : []
    const insecure = cfg.tls === 'self-signed' ? ['-k'] : []

    const front = await run('curl', [...insecure, ...auth, '-sS', '-o', '/dev/null', '-w', '%{http_code}', base, '--max-time', '15'])
    const frontCode = front.stdout.trim()
    hints.push(`GET /            → ${frontCode || front.stderr.trim()}`)
    if (frontCode !== '200') problems.push(`frontend returned ${frontCode || 'nothing'}`)

    // Through the proxy: this is what proves nginx is injecting the bearer
    // token — the browser sends none and the core still answers.
    const api = await run('curl', [...insecure, ...auth, '-sS', '-w', '\n%{http_code}', `${base}/api/storage/root`, '--max-time', '15'])
    const apiLines = api.stdout.trim().split('\n')
    const apiCode = apiLines[apiLines.length - 1]
    hints.push(`GET /api/storage/root → ${apiCode}: ${apiLines.slice(0, -1).join(' ').slice(0, 120)}`)
    if (apiCode === '401') problems.push('the core rejected the proxied token — nginx and the env file disagree on ELIO_API_TOKEN')
    else if (apiCode !== '200') problems.push(`storage API returned ${apiCode}`)

    // Unauthenticated request must NOT get through when a gate is configured.
    if (cfg.basicAuthUser) {
      const naked = await run('curl', [...insecure, '-sS', '-o', '/dev/null', '-w', '%{http_code}', base, '--max-time', '15'])
      const code = naked.stdout.trim()
      hints.push(`GET / without credentials → ${code}`)
      if (code !== '401') problems.push(`the auth gate is not enforcing (expected 401, got ${code})`)
    }

    if (problems.length) return fail(problems.join('; '), hints)
    return ok('the instance answers from the outside', hints)
  },
}

export const DEPLOY_STEPS: DeployStep[] = [
  preflight,
  identity,
  packages,
  network,
  source,
  dependencies,
  buildWeb,
  storage,
  service,
  database,
  webserver,
  tls,
  verify,
]

export function stepById(id: string): DeployStep | undefined {
  return DEPLOY_STEPS.find((s) => s.id === id)
}

// Run every step's check in order. Sequential on purpose: a later check is
// often meaningless if an earlier one failed, and the operator reads them top
// to bottom anyway.
export async function checkAll(
  ctx: StepContext,
  onResult?: (id: string, report: StepReport) => void,
): Promise<Map<string, StepReport>> {
  const results = new Map<string, StepReport>()
  for (const step of DEPLOY_STEPS) {
    let report: StepReport
    try {
      report = await step.check(ctx)
    } catch (err) {
      report = fail(String(err))
    }
    results.set(step.id, report)
    onResult?.(step.id, report)
  }
  return results
}
