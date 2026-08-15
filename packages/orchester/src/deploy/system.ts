// Host primitives the deploy layer needs: run a command, run it as root, look
// up a binary, ask the kernel whether a port is free, resolve DNS.
//
// Everything here is best-effort and never throws for "the host does not have
// this" — a missing binary is a fact the wizard reports, not an exception. Only
// genuinely broken invocations reject.
//
// Local-first: nothing in this file reaches the network except `publicIp()`,
// which the caller treats as an optional signal.

import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve4 } from 'node:dns/promises'
import { readFileSync } from 'node:fs'

export interface RunResult {
  ok: boolean
  code: number
  stdout: string
  stderr: string
}

export interface RunOptions {
  cwd?: string
  env?: Record<string, string>
  // Feed this to the child's stdin (used to pipe config files into `tee`).
  input?: string
  timeoutMs?: number
}

// Run a command, capturing both streams. Never rejects — inspect `ok`.
export function run(command: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
      stdio: [opts.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (code: number): void => {
      if (settled) return
      settled = true
      resolve({ ok: code === 0, code, stdout, stderr })
    }
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL')
          stderr += `\n[timeout after ${opts.timeoutMs}ms]`
          finish(124)
        }, opts.timeoutMs)
      : null

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('error', (err) => { stderr += String(err); finish(127) })
    child.on('close', (code) => { if (timer) clearTimeout(timer); finish(code ?? 1) })

    if (opts.input !== undefined) {
      child.stdin?.write(opts.input)
      child.stdin?.end()
    }
  })
}

export const isRoot = (): boolean => typeof process.getuid === 'function' && process.getuid() === 0

// Run privileged. Already root → run directly. Otherwise `sudo -n` (no prompt):
// the wizard's preflight is what establishes that passwordless sudo works, so a
// step that suddenly needs a password fails loudly instead of hanging forever on
// a TTY the daemon may not even have.
export function runPrivileged(command: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  if (isRoot()) return run(command, args, opts)
  return run('sudo', ['-n', command, ...args], opts)
}

// Write a file to a root-owned path without needing a root-owned node process:
// pipe the content through `tee`. Returns the run result so callers can report
// the real stderr.
export function writePrivileged(path: string, content: string, mode?: string): Promise<RunResult> {
  return runPrivileged('tee', [path], { input: content }).then(async (res) => {
    if (!res.ok || !mode) return res
    return runPrivileged('chmod', [mode, path])
  })
}

// Absolute path of a binary, or null. Synchronous: callers use it inside
// cheap capability checks.
export function which(bin: string): string | null {
  const res = spawnSync('sh', ['-c', `command -v ${bin} 2>/dev/null`], { encoding: 'utf-8' })
  const out = (res.stdout ?? '').trim()
  return out || null
}

export interface HostInfo {
  platform: NodeJS.Platform
  // 'debian' | 'rhel' | 'arch' | 'unknown' — decides the package manager.
  family: 'debian' | 'rhel' | 'arch' | 'unknown'
  prettyName: string
  hasSystemd: boolean
  nodeVersion: string
  arch: string
}

export function hostInfo(): HostInfo {
  let prettyName = process.platform as string
  let family: HostInfo['family'] = 'unknown'
  try {
    const os = readFileSync('/etc/os-release', 'utf-8')
    prettyName = /^PRETTY_NAME="?([^"\n]+)"?/m.exec(os)?.[1] ?? prettyName
    const idLike = `${/^ID=(.*)$/m.exec(os)?.[1] ?? ''} ${/^ID_LIKE=(.*)$/m.exec(os)?.[1] ?? ''}`
    if (/debian|ubuntu/i.test(idLike)) family = 'debian'
    else if (/rhel|fedora|centos/i.test(idLike)) family = 'rhel'
    else if (/arch/i.test(idLike)) family = 'arch'
  } catch {
    // Not a Linux with os-release (macOS dev box) — family stays 'unknown'.
  }
  return {
    platform: process.platform,
    family,
    prettyName,
    hasSystemd: which('systemctl') !== null,
    nodeVersion: process.versions.node,
    arch: process.arch,
  }
}

// The install command for this host's package manager, or null when we don't
// know how to install on it (the wizard then asks the user to do it by hand).
export function installCmd(family: HostInfo['family'], packages: string[]): { cmd: string; args: string[] } | null {
  switch (family) {
    case 'debian':
      return { cmd: 'apt-get', args: ['install', '-y', ...packages] }
    case 'rhel':
      return { cmd: 'dnf', args: ['install', '-y', ...packages] }
    case 'arch':
      return { cmd: 'pacman', args: ['-S', '--noconfirm', ...packages] }
    default:
      return null
  }
}

// True when nothing is listening on `port` (we can bind it ourselves).
export function portFree(port: number, host = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, host)
  })
}

// What is holding a port, when we can tell. Purely informational.
export async function portHolder(port: number): Promise<string | null> {
  if (which('ss')) {
    const res = await run('ss', ['-lntp', `sport = :${port}`])
    const line = res.stdout.split('\n').find((l) => l.includes(`:${port}`))
    return line?.trim() ?? null
  }
  if (which('lsof')) {
    const res = await run('lsof', ['-i', `:${port}`, '-sTCP:LISTEN', '-P', '-n'])
    return res.stdout.split('\n')[1]?.trim() ?? null
  }
  return null
}

// A records for a hostname. Empty array when it does not resolve.
export async function dnsA(hostname: string): Promise<string[]> {
  try {
    return await resolve4(hostname)
  } catch {
    return []
  }
}

// This machine's public IP, via a plain-text echo service. Optional path: a
// fully offline box gets null and the DNS check downgrades to a warning.
export async function publicIp(timeoutMs = 5000): Promise<string | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch('https://api.ipify.org', { signal: ctl.signal })
    if (!res.ok) return null
    const ip = (await res.text()).trim()
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Bytes free on the filesystem holding `path`. null when df is unavailable.
export async function freeBytes(path: string): Promise<number | null> {
  const res = await run('df', ['-Pk', path])
  const line = res.stdout.split('\n')[1]
  const kb = line ? Number(line.split(/\s+/)[3]) : NaN
  return Number.isFinite(kb) ? kb * 1024 : null
}
