// Static file server + /api reverse proxy for a built web frontend.
// Extracted from platforms/electronApp/src/main/serveFrontend.ts so the
// orchester daemon and Electron share one implementation. The web app uses
// axios baseURL '/api', so this proxies /api/* to the core API and the app
// never needs to know its own host.

import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'

export interface FrontendServerOptions {
  // Directory to serve (e.g. platforms/web/dist).
  servePath: string
  // Port to listen on.
  port: number
  // Host:port of the core API to forward /api/* to (default core on 3001).
  apiHost?: string
  apiPort?: number
  // Origin the injected presence script posts to (default same-origin '').
  presenceApiOrigin?: string
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
}

function mime(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

// Browser tab announces itself to the core so the instance can list connected
// devices. apiOrigin '' means same-origin (proxied through this server).
function presenceScript(apiOrigin: string): string {
  return `<script>
(function(){
  var API='${apiOrigin}';
  var id=localStorage.getItem('__elio_dev_id');
  if(!id){id=([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,function(c){return(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)});localStorage.setItem('__elio_dev_id',id);}
  function hello(){fetch(API+'/api/__presence/hello',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,agent:navigator.userAgent,platform:navigator.platform})}).catch(function(){});}
  function bye(){navigator.sendBeacon(API+'/api/__presence/bye',JSON.stringify({id:id}));}
  hello();
  var t=setInterval(hello,30000);
  window.addEventListener('beforeunload',function(){clearInterval(t);bye();});
})();
</script>`
}

function proxyToApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  apiHost: string,
  apiPort: number,
): void {
  const options: http.RequestOptions = {
    hostname: apiHost,
    port: apiPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${apiHost}:${apiPort}` },
  }
  const proxy = http.request(options, (apiRes) => {
    res.writeHead(apiRes.statusCode ?? 200, {
      ...apiRes.headers,
      'access-control-allow-origin': '*',
    })
    apiRes.pipe(res)
  })
  proxy.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('API unavailable')
  })
  req.pipe(proxy)
}

export class FrontendServer {
  private server: http.Server | null = null
  private _port: number | null = null

  start(opts: FrontendServerOptions): Promise<{ port: number }> {
    const { servePath, port } = opts
    const apiHost = opts.apiHost ?? '127.0.0.1'
    const apiPort = opts.apiPort ?? 3001
    const script = presenceScript(opts.presenceApiOrigin ?? '')

    return new Promise((resolve, reject) => {
      if (this.server?.listening) {
        resolve({ port: this._port! })
        return
      }

      this.server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost:${port}`)

        if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
          proxyToApi(req, res, apiHost, apiPort)
          return
        }

        const filePath = path.join(servePath, decodeURIComponent(url.pathname))

        const send = (p: string): void => {
          try {
            const stat = fs.statSync(p)
            if (stat.isDirectory()) {
              send(path.join(p, 'index.html'))
              return
            }
            if (path.extname(p).toLowerCase() === '.html') {
              const html = fs.readFileSync(p, 'utf-8').replace('</body>', script + '</body>')
              const buf = Buffer.from(html, 'utf-8')
              res.writeHead(200, { 'Content-Type': mime(p), 'Content-Length': buf.length })
              res.end(buf)
              return
            }
            const data = fs.readFileSync(p)
            res.writeHead(200, { 'Content-Type': mime(p), 'Content-Length': data.length })
            res.end(data)
          } catch {
            const index = path.join(servePath, 'index.html')
            if (p !== index && fs.existsSync(index)) {
              send(index)
            } else {
              res.writeHead(404, { 'Content-Type': 'text/plain' })
              res.end('Not found')
            }
          }
        }

        send(filePath)
      })

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        this.server = null
        this._port = null
        reject(err)
      })

      this.server.listen(port, () => {
        this._port = port
        resolve({ port })
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve()
        return
      }
      this.server.close((err) => {
        this.server = null
        this._port = null
        if (err) reject(err)
        else resolve()
      })
    })
  }

  isRunning(): boolean {
    return this.server?.listening ?? false
  }

  get port(): number | null {
    return this._port
  }
}

// Pool of FrontendServers keyed by id — backs folder shares (each share is its
// own static server on its own port).
export class FrontendServerPool {
  private pool = new Map<string, FrontendServer>()

  get(id: string): FrontendServer {
    let srv = this.pool.get(id)
    if (!srv) {
      srv = new FrontendServer()
      this.pool.set(id, srv)
    }
    return srv
  }

  async remove(id: string): Promise<void> {
    const srv = this.pool.get(id)
    if (srv?.isRunning()) await srv.stop()
    this.pool.delete(id)
  }
}
