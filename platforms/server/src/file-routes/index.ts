// File browsing routes for the core. Moved out of the Electron embedded API so
// both the web frontend and Electron read files from the single core API.
//
// Mounted at /api/files. Confined to a root dir (default: home) for safety.
// The NAS file-server (file-server/index.ts) reuses serveDir/listDir for shares.

import { homedir } from 'node:os'
import { resolve, normalize, sep, extname, basename } from 'node:path'
import { createReadStream, statSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { Router, type Request, type Response } from 'express'

const MIME: Record<string, string> = {
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript',
  json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg',
  wav: 'audio/wav', ogg: 'audio/ogg', pdf: 'application/pdf',
  txt: 'text/plain', md: 'text/markdown', xml: 'application/xml',
  zip: 'application/zip', gz: 'application/gzip',
}

export function mimeFor(filePath: string): string {
  const ext = extname(filePath).slice(1).toLowerCase()
  return MIME[ext] ?? 'application/octet-stream'
}

// Confine a requested path to `root`. Returns the absolute path or null.
export function safePathWithin(root: string, p: string): string | null {
  try {
    const base = resolve(normalize(root))
    const abs = resolve(normalize(p))
    const ok = abs === base || abs.startsWith(base + sep)
    return ok ? abs : null
  } catch {
    return null
  }
}

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  mtimeMs: number
  ext: string
}

export async function listDir(dir: string): Promise<FileEntry[]> {
  const dirents = await readdir(dir, { withFileTypes: true })
  const entries = await Promise.all(
    dirents
      .filter((d) => !d.name.startsWith('.'))
      .map(async (d): Promise<FileEntry> => {
        const full = `${dir}${sep}${d.name}`
        try {
          const st = await stat(full)
          return {
            name: d.name,
            path: full,
            isDir: st.isDirectory(),
            size: st.size,
            mtimeMs: st.mtimeMs,
            ext: st.isDirectory() ? '' : extname(d.name).slice(1).toLowerCase(),
          }
        } catch {
          return { name: d.name, path: full, isDir: d.isDirectory(), size: 0, mtimeMs: 0, ext: '' }
        }
      }),
  )
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  return entries
}

// Stream a file to the response with MIME + range support.
export function serveFile(abs: string, req: Request, res: Response): void {
  let st: ReturnType<typeof statSync>
  try { st = statSync(abs) } catch { res.status(404).json({ error: 'not found' }); return }
  if (st.isDirectory()) { res.status(400).json({ error: 'is a directory' }); return }

  const mime = mimeFor(abs)
  const total = st.size
  const rangeHeader = req.headers['range']

  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-')
    const start = parseInt(startStr ?? '0', 10)
    const end = endStr ? parseInt(endStr, 10) : total - 1
    const chunkSize = end - start + 1
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="${basename(abs)}"`,
    })
    createReadStream(abs, { start, end }).pipe(res)
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `inline; filename="${basename(abs)}"`,
    })
    createReadStream(abs).pipe(res)
  }
}

// root defaults to the user's home; override with ELIO_FILES_ROOT.
export function createFileRouter(root: string = process.env['ELIO_FILES_ROOT'] ?? homedir()): Router {
  const router = Router()

  router.get('/list', async (req: Request, res: Response) => {
    const raw = typeof req.query['path'] === 'string' ? req.query['path'] : root
    const dir = safePathWithin(root, raw)
    if (!dir) { res.status(403).json({ error: 'forbidden' }); return }
    try {
      res.json({ path: dir, entries: await listDir(dir) })
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  router.get('/serve', (req: Request, res: Response) => {
    const raw = typeof req.query['path'] === 'string' ? req.query['path'] : null
    if (!raw) { res.status(400).json({ error: 'missing path' }); return }
    const abs = safePathWithin(root, raw)
    if (!abs) { res.status(403).json({ error: 'forbidden' }); return }
    serveFile(abs, req, res)
  })

  return router
}
