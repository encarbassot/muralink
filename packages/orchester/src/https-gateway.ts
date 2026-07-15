// HTTPS gateway — TLS terminator that reverse-proxies everything to the local
// web-frontend (which in turn serves the web app and proxies /api to the core).
// This is the single endpoint a Raspberry Pi exposes to the network.

import * as https from 'node:https'
import * as http from 'node:http'
import { ensureSelfSigned } from './tls'

export interface HttpsGatewayOptions {
  port: number
  // host:port of the plain-HTTP web-frontend to forward to.
  targetHost?: string
  targetPort: number
  // domain for the self-signed cert (CN / SAN).
  domain?: string
}

export class HttpsGateway {
  private server: https.Server | null = null
  private _port: number | null = null

  start(opts: HttpsGatewayOptions): Promise<{ port: number }> {
    const targetHost = opts.targetHost ?? '127.0.0.1'
    const { cert, key } = ensureSelfSigned(opts.domain ?? 'localhost')

    return new Promise((resolve, reject) => {
      if (this.server?.listening) {
        resolve({ port: this._port! })
        return
      }
      this.server = https.createServer({ cert, key }, (req, res) => {
        const proxy = http.request(
          {
            hostname: targetHost,
            port: opts.targetPort,
            path: req.url,
            method: req.method,
            headers: req.headers,
          },
          (upstream) => {
            res.writeHead(upstream.statusCode ?? 502, upstream.headers)
            upstream.pipe(res)
          },
        )
        proxy.on('error', () => {
          res.writeHead(502, { 'Content-Type': 'text/plain' })
          res.end('upstream unavailable')
        })
        req.pipe(proxy)
      })
      this.server.on('error', (err) => {
        this.server = null
        this._port = null
        reject(err)
      })
      this.server.listen(opts.port, () => {
        this._port = opts.port
        resolve({ port: opts.port })
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) { resolve(); return }
      this.server.close(() => {
        this.server = null
        this._port = null
        resolve()
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
