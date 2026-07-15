// Embedded Express API server. Runs inside the Electron main process.
// Binds to 0.0.0.0 so LAN peers can reach it; renderer talks to localhost.
//
// Routes:
//   GET /health
//   GET /api/modules          — registered modules (stub)
//   GET /api/files/list?path= — list directory as JSON
//   GET /api/files/serve?path=— serve a file with MIME type (streaming, range-aware)

import { createServer, type Server } from 'node:http'
import { homedir, networkInterfaces } from 'node:os'
import { resolve, normalize, sep, extname, basename } from 'node:path'
import { createReadStream, statSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import express, { type Request, type Response } from 'express'
import cors from 'cors'
import { presenceService } from './presenceService.js'

const HOME = homedir()
const MIME: Record<string, string> = {
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript',
  json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg',
  wav: 'audio/wav', ogg: 'audio/ogg', pdf: 'application/pdf',
  txt: 'text/plain', md: 'text/markdown', xml: 'application/xml',
  zip: 'application/zip', gz: 'application/gzip',
}

function safePath(p: string): string | null {
  try {
    const abs = resolve(normalize(p))
    const ok = abs === HOME || abs.startsWith(HOME + sep)
    return ok ? abs : null
  } catch {
    return null
  }
}

function mimeFor(filePath: string): string {
  const ext = extname(filePath).slice(1).toLowerCase()
  return MIME[ext] ?? 'application/octet-stream'
}

export interface ServerStatus {
  running: boolean
  port: number | null
  lanUrl: string | null
}

let httpServer: Server | null = null
let activePort: number | null = null

function getLanAddress(): string | null {
  const nets = networkInterfaces()
  for (const iface of Object.values(nets)) {
    if (!iface) continue
    for (const n of iface) {
      if (n.family === 'IPv4' && !n.internal) return n.address
    }
  }
  return null
}

export async function startServer(port = 3131): Promise<ServerStatus> {
  if (httpServer) return getStatus()

  const app = express()
  app.use(cors({ origin: '*' }))
  app.use(express.json())

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, ts: Date.now() })
  })

  app.get('/api/modules', (_req: Request, res: Response) => {
    res.json({ modules: [] })
  })

  // Presence — web frontend clients announce themselves here
  app.post('/api/__presence/hello', (req: Request, res: Response) => {
    const { id, agent = '', platform = '' } = req.body as { id?: string; agent?: string; platform?: string }
    if (!id) { res.status(400).json({ error: 'missing id' }); return }
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? 'unknown'
    presenceService.hello(id, agent, platform, ip)
    res.json({ ok: true })
  })

  app.post('/api/__presence/bye', (req: Request, res: Response) => {
    const { id } = req.body as { id?: string }
    if (id) presenceService.bye(id)
    res.json({ ok: true })
  })

  app.get('/api/__presence/devices', (_req: Request, res: Response) => {
    res.json({ devices: presenceService.list() })
  })

  app.get('/api/files/list', async (req: Request, res: Response) => {
    const raw = typeof req.query['path'] === 'string' ? req.query['path'] : HOME
    const dir = safePath(raw)
    if (!dir) { res.status(403).json({ error: 'forbidden' }); return }
    try {
      const dirents = await readdir(dir, { withFileTypes: true })
      const entries = await Promise.all(
        dirents
          .filter((d) => !d.name.startsWith('.'))
          .map(async (d) => {
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
      res.json({ path: dir, entries })
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  app.get('/api/files/serve', (req: Request, res: Response) => {
    const raw = typeof req.query['path'] === 'string' ? req.query['path'] : null
    if (!raw) { res.status(400).json({ error: 'missing path' }); return }
    const abs = safePath(raw)
    if (!abs) { res.status(403).json({ error: 'forbidden' }); return }

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
  })

  return new Promise((resolvePromise, reject) => {
    httpServer = createServer(app)
    httpServer.listen(port, '0.0.0.0', () => {
      activePort = port
      presenceService.start()
      resolvePromise(getStatus())
    })
    httpServer.on('error', (err) => {
      httpServer = null
      reject(err)
    })
  })
}

export function stopServer(): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    if (!httpServer) { resolvePromise(); return }
    httpServer.close((err) => {
      httpServer = null
      activePort = null
      presenceService.stop()
      if (err) reject(err)
      else resolvePromise()
    })
  })
}

export function getStatus(): ServerStatus {
  const lan = activePort ? getLanAddress() : null
  return {
    running: httpServer !== null,
    port: activePort,
    lanUrl: lan && activePort ? `http://${lan}:${activePort}` : null,
  }
}
