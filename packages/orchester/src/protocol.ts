// Wire protocol for the orchester control socket.
// Newline-delimited JSON over a unix domain socket. The CLI and the Electron
// adapter are both clients; the daemon is the single server.

import type { ManagedService } from './orchester'

export type RpcMethod =
  | 'status'
  | 'start'
  | 'stop'
  | 'restart'
  | 'configure'
  | 'addShare'
  | 'removeShare'
  | 'updateShare'
  | 'subscribe'
  | 'logs'
  | 'ping'
  | 'accountStatus'
  | 'accountLogin'
  | 'accountLogout'

export interface LogLine {
  id: string
  line: string
}

export interface RpcRequest {
  id: number
  method: RpcMethod
  params?: Record<string, unknown>
}

export interface RpcResponse {
  id: number
  ok: boolean
  result?: unknown
  error?: string
}

// Pushed to subscribers (id: 0 — not a reply to any request).
export interface StatusEvent {
  id: 0
  event: 'status-change'
  data: ManagedService[]
}

export interface LogEvent {
  id: 0
  event: 'log'
  data: LogLine
}

export type RpcEvent = StatusEvent | LogEvent

export type RpcMessage = RpcResponse | RpcEvent

export function isEvent(msg: RpcMessage): msg is RpcEvent {
  return (msg as RpcEvent).id === 0 && 'event' in msg
}
