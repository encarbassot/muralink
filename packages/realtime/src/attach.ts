// Wires a RealtimeHub to an existing http.Server via a WebSocket upgrade
// handler. Kept separate from hub.ts so the hub itself has zero dependency on
// http/ws upgrade mechanics and stays trivially unit-testable.
//
// Auth follows the same model as /api/storage/serve: a browser WebSocket
// handshake cannot carry a custom Authorization header, so the bearer token
// travels as a query param (`?token=`). verifyToken is injected by the
// platform server so this package never hardcodes the token scheme.

import { createHash } from 'crypto'
import type { IncomingMessage, Server } from 'http'
import type { Duplex } from 'stream'
import { WebSocketServer } from 'ws'
import { RealtimeHub } from './hub.ts'

export interface AttachRealtimeOptions {
  /** Path the WS endpoint is mounted at. Default: '/api/realtime'. */
  path?: string
  /** Return true to accept the connection. Receives the raw token (may be undefined). */
  verifyToken?: (token: string | undefined) => boolean
}

export function attachRealtime(server: Server, options: AttachRealtimeOptions = {}): RealtimeHub {
  const path = options.path ?? '/api/realtime'
  const hub = new RealtimeHub()
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '', 'http://internal')
    if (url.pathname !== path) return // let other upgrade handlers (if any) see it

    const token = url.searchParams.get('token') ?? undefined
    if (options.verifyToken && !options.verifyToken(token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      hub.addClient(ws)
    })
  })

  return hub
}

// Not currently used (query-token auth covers the browser case) but kept as a
// documented escape hatch for non-browser clients (Android/desktop) that CAN
// set arbitrary headers during the WS handshake, in case a future client
// prefers that over the query param.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
