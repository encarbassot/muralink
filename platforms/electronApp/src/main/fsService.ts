// fsService — the ONLY place filesystem logic lives. Every renderer fs need
// goes through here via IPC, so the future tunnel-callback API and the git
// tracker can wrap this one module instead of reaching into routes/UI.
//
// v1 scope: read (list/stat/text) + basic mutations (rename/move/mkdir/copy)
// + delete-to-trash (reversible). No hard `rm`. All ops are bounded to the
// user's home tree (see ROOTS) — "we don't want your data": nothing leaves the
// machine, and we don't roam the whole disk.

import { homedir } from 'node:os'
import { resolve, normalize, sep, basename, join, dirname, extname } from 'node:path'
import { promises as fs } from 'node:fs'
import { shell } from 'electron'

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  mtimeMs: number
  ext: string // lowercase, no dot ('' for none / dirs)
}

export interface StatInfo {
  path: string
  name: string
  isDir: boolean
  size: number
  mtimeMs: number
  ctimeMs: number
  ext: string
}

export interface TextResult {
  text: string
  truncated: boolean
  /** false when the file looked binary (null byte found) and we refused. */
  isText: boolean
}

const HOME = homedir()
// Allowed roots for v1 — the home tree only. Widen later if needed.
const ROOTS = [HOME]

const TEXT_CAP = 1_000_000 // ~1 MB

/** Resolve + assert a path stays inside an allowed root. Throws otherwise. */
function safe(p: string): string {
  const abs = resolve(normalize(p))
  const ok = ROOTS.some((root) => abs === root || abs.startsWith(root + sep))
  if (!ok) throw new Error(`Path outside allowed roots: ${abs}`)
  return abs
}

function extOf(name: string, isDir: boolean): string {
  if (isDir) return ''
  return extname(name).slice(1).toLowerCase()
}

export function homeDir(): string {
  return HOME
}

export async function listDir(p: string): Promise<DirEntry[]> {
  const dir = safe(p)
  const dirents = await fs.readdir(dir, { withFileTypes: true })
  const out: DirEntry[] = []
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue // hide dotfiles in v1
    const full = join(dir, d.name)
    let isDir = d.isDirectory()
    let size = 0
    let mtimeMs = 0
    try {
      const st = await fs.stat(full) // follow symlinks; tolerate broken ones
      isDir = st.isDirectory()
      size = st.size
      mtimeMs = st.mtimeMs
    } catch {
      // unreadable entry (broken symlink, perms) — keep name, skip metadata
    }
    out.push({ name: d.name, path: full, isDir, size, mtimeMs, ext: extOf(d.name, isDir) })
  }
  // dirs first, then case-insensitive name
  out.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  return out
}

export async function stat(p: string): Promise<StatInfo> {
  const abs = safe(p)
  const st = await fs.stat(abs)
  const isDir = st.isDirectory()
  return {
    path: abs,
    name: basename(abs),
    isDir,
    size: st.size,
    mtimeMs: st.mtimeMs,
    ctimeMs: st.ctimeMs,
    ext: extOf(abs, isDir),
  }
}

export async function writeText(p: string, content: string): Promise<void> {
  const abs = safe(p)
  await fs.writeFile(abs, content, 'utf8')
}

export async function readText(p: string, maxBytes = TEXT_CAP): Promise<TextResult> {
  const abs = safe(p)
  const handle = await fs.open(abs, 'r')
  try {
    const cap = Math.max(1, Math.min(maxBytes, TEXT_CAP))
    const buf = Buffer.alloc(cap)
    const { bytesRead } = await handle.read(buf, 0, cap, 0)
    const slice = buf.subarray(0, bytesRead)
    if (slice.includes(0)) return { text: '', truncated: false, isText: false }
    const { size } = await handle.stat()
    return { text: slice.toString('utf8'), truncated: size > bytesRead, isText: true }
  } finally {
    await handle.close()
  }
}

export async function rename(p: string, newName: string): Promise<string> {
  const abs = safe(p)
  if (!newName || newName.includes('/') || newName.includes(sep) || newName.includes('\0')) {
    throw new Error(`Invalid name: ${newName}`)
  }
  const dest = safe(join(dirname(abs), newName))
  await fs.rename(abs, dest)
  return dest
}

export async function move(src: string, destDir: string): Promise<string> {
  const from = safe(src)
  const intoDir = safe(destDir)
  const dest = join(intoDir, basename(from))
  if (dest === from) return from
  await fs.rename(from, dest)
  return dest
}

export async function mkdir(parent: string, name: string): Promise<string> {
  if (!name || name.includes('/') || name.includes(sep) || name.includes('\0')) {
    throw new Error(`Invalid folder name: ${name}`)
  }
  const dest = safe(join(safe(parent), name))
  await fs.mkdir(dest)
  return dest
}

export async function copy(src: string, destDir: string): Promise<string> {
  const from = safe(src)
  const intoDir = safe(destDir)
  let dest = join(intoDir, basename(from))
  // never overwrite: suffix " copy" until free
  if (dest === from || (await exists(dest))) {
    const ext = extname(from)
    const stem = basename(from, ext)
    let n = 1
    do {
      const suffix = n === 1 ? ' copy' : ` copy ${n}`
      dest = join(intoDir, `${stem}${suffix}${ext}`)
      n++
    } while (await exists(dest))
  }
  await fs.cp(from, dest, { recursive: true, errorOnExist: true })
  return dest
}

/** Reversible delete — sends to macOS Trash, never a hard rm. */
export async function trash(p: string): Promise<void> {
  const abs = safe(p)
  await shell.trashItem(abs)
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}
