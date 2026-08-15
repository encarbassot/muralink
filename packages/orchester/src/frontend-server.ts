// Static file server + /api reverse proxy for a built web frontend.
// Extracted from platforms/electronApp/src/main/serveFrontend.ts so the
// orchester daemon and Electron share one implementation. The web app uses
// axios baseURL '/api', so this proxies /api/* to the core API and the app
// never needs to know its own host.

import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  SESSION_COOKIE, clearedCookie, mintSession, readCookie, sessionCookie,
  verifyPassword, verifySession, type SessionConfig,
} from './session'

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
  // The login gate. Absent = no gate at this layer (a LAN deploy, or a front
  // that gates on its own).
  session?: SessionConfig
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

// ── the login gate ───────────────────────────────────────────────────────────

// Rendered by hand rather than by the app: nginx serves this *instead of* the
// bundle, so it has to stand alone with no build step and no network. It
// follows the app's dark surface so the first screen of an instance does not
// look like a server error page.
function loginPage(opts: { error?: boolean; next: string }): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Muralink</title>
<style>
  :root { color-scheme: dark light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0b0d10; color: #e8eaed; padding: 24px;
    font: 15px/1.5 Inter, system-ui, -apple-system, sans-serif;
  }
  form {
    width: 100%; max-width: 340px; display: flex; flex-direction: column; gap: 14px;
    background: #14171c; border: 1px solid #262b33; border-radius: 14px; padding: 28px;
    box-shadow: 0 20px 60px rgba(0,0,0,.45);
  }
  h1 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -.01em; }
  p.sub { margin: -6px 0 4px; font-size: 12.5px; color: #98a2b3; }
  label { font-size: 12px; color: #98a2b3; display: flex; flex-direction: column; gap: 6px; }
  input {
    font: inherit; color: inherit; background: #0f1216; border: 1px solid #2b313a;
    border-radius: 9px; padding: 10px 12px; outline: none; width: 100%;
  }
  input:focus { border-color: #4c9fff; }
  button {
    font: inherit; font-weight: 600; cursor: pointer; border: none; border-radius: 9px;
    padding: 11px 14px; background: #4c9fff; color: #06121f;
  }
  button:hover { background: #6bb0ff; }
  .error {
    font-size: 12.5px; color: #ffb4ab; background: rgba(255,80,80,.09);
    border: 1px solid rgba(255,120,120,.28); border-radius: 9px; padding: 9px 11px;
  }
</style>
</head>
<body>
  <form method="POST" action="/__login">
    <h1>Muralink</h1>
    <p class="sub">Esta instancia es privada.</p>
    ${opts.error ? '<div class="error">Usuario o contraseña incorrectos.</div>' : ''}
    <label>Usuario
      <input name="user" autocomplete="username" autocapitalize="none" autocorrect="off" autofocus required>
    </label>
    <label>Contraseña
      <input name="password" type="password" autocomplete="current-password" required>
    </label>
    <input type="hidden" name="next" value="${escapeAttr(opts.next)}">
    <button type="submit">Entrar</button>
  </form>
</body>
</html>`
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

// Only same-origin paths. A `next` taken from the query string is attacker
// controlled: without this an instance becomes an open redirect that lends its
// domain to a phishing page.
function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

function readBody(req: http.IncomingMessage, limit = 8 * 1024): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > limit) { body = body.slice(0, limit); req.destroy() }
    })
    req.on('end', () => resolve(body))
    req.on('error', () => resolve(body))
  })
}

// True when the request already reached us over TLS, so the cookie can be
// marked Secure. Behind nginx that fact only survives in the forwarded header.
function isSecureRequest(req: http.IncomingMessage): boolean {
  const proto = req.headers['x-forwarded-proto']
  return (Array.isArray(proto) ? proto[0] : proto) === 'https'
}

// Returns true when it handled the request.
function handleAuthRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  session: SessionConfig,
): boolean {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE)

  // nginx's auth_request subrequest. Body is discarded by nginx; only the
  // status matters.
  if (url.pathname === '/__auth') {
    const okSession = verifySession(token, session)
    res.writeHead(okSession ? 204 : 401)
    res.end()
    return true
  }

  if (url.pathname === '/__login') {
    if (req.method === 'GET') {
      // Already signed in and asking for the login page: send them on rather
      // than showing a form that would confuse.
      if (verifySession(token, session)) {
        res.writeHead(302, { Location: safeNext(url.searchParams.get('next')) })
        res.end()
        return true
      }
      const html = loginPage({
        error: url.searchParams.get('error') === '1',
        next: safeNext(url.searchParams.get('next')),
      })
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(html)
      return true
    }

    if (req.method === 'POST') {
      void readBody(req).then((body) => {
        const form = new URLSearchParams(body)
        const user = form.get('user') ?? ''
        const password = form.get('password') ?? ''
        const next = safeNext(form.get('next'))

        // Verify the password even when the user is wrong, so a wrong username
        // and a wrong password take the same time to reject.
        const passwordOk = verifyPassword(password, session.passwordHash)
        if (!passwordOk || user !== session.user) {
          res.writeHead(302, { Location: `/__login?error=1&next=${encodeURIComponent(next)}`, 'Cache-Control': 'no-store' })
          res.end()
          return
        }

        res.writeHead(302, {
          Location: next,
          'Set-Cookie': sessionCookie(mintSession(session), { secure: isSecureRequest(req) }),
          'Cache-Control': 'no-store',
        })
        res.end()
      })
      return true
    }
  }

  if (url.pathname === '/__logout') {
    res.writeHead(302, {
      Location: '/__login',
      'Set-Cookie': clearedCookie({ secure: isSecureRequest(req) }),
      'Cache-Control': 'no-store',
    })
    res.end()
    return true
  }

  return false
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

        // The login gate, when one is configured. These three paths are the
        // only ones nginx leaves ungated, so they must never serve instance
        // data — they only answer "is this session valid" and take a password.
        if (opts.session && handleAuthRoutes(req, res, url, opts.session)) return

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
            // SPA fallback is for *navigations* only. A request that names a
            // file extension (/assets/index-abc.css after a redeploy changed
            // the hash) must 404 — answering it with index.html returns HTML
            // under a text/html type, which the browser silently discards.
            // That failure mode looks like "the app lost its styles" with no
            // error anywhere. Fail loudly instead.
            const index = path.join(servePath, 'index.html')
            if (path.extname(p) === '' && p !== index && fs.existsSync(index)) {
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
