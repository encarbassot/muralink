// Generic pub/sub over WebSocket, scoped by "topic" (an opaque string the
// caller chooses — e.g. "video-editor:<projectId>" or "notes:<spaceId>").
// The hub knows nothing about message contents: it relays JSON envelopes to
// every other client subscribed to the same topic. Durability, ordering
// guarantees and message semantics belong to the module using it — this is
// intentionally the thinnest possible shared layer so any future module
// (collaborative notes, live cursors, whatever) can reuse it without taking
// on video-editor's assumptions.
//
// Wire protocol (client -> server):
//   { type: 'sub',   topic }
//   { type: 'unsub', topic }
//   { type: 'pub',   topic, payload }
//
// Wire protocol (server -> client):
//   { type: 'event', topic, payload, senderId }
//   { type: 'ack',   topic }               // subscription confirmed
//   { type: 'error', message }

import { randomUUID } from 'crypto'
import type { WebSocket } from 'ws'

export interface RealtimeEnvelopeIn {
  type: 'sub' | 'unsub' | 'pub'
  topic: string
  payload?: unknown
}

export type RealtimeEnvelopeOut =
  | { type: 'event'; topic: string; payload: unknown; senderId: string }
  | { type: 'ack'; topic: string }
  | { type: 'error'; message: string }

interface Client {
  id: string
  ws: WebSocket
  topics: Set<string>
}

export class RealtimeHub {
  #clients = new Map<string, Client>()
  #rooms = new Map<string, Set<string>>() // topic -> client ids

  /** Registers a freshly-upgraded socket and wires its message loop. Returns
   *  the assigned client id (useful for logging/tests). */
  addClient(ws: WebSocket): string {
    const id = randomUUID()
    const client: Client = { id, ws, topics: new Set() }
    this.#clients.set(id, client)

    ws.on('message', (raw) => {
      let msg: RealtimeEnvelopeIn
      try {
        msg = JSON.parse(String(raw)) as RealtimeEnvelopeIn
      } catch {
        this.#send(ws, { type: 'error', message: 'invalid json' })
        return
      }
      this.#handle(client, msg)
    })

    ws.on('close', () => this.#removeClient(id))
    ws.on('error', () => this.#removeClient(id))

    return id
  }

  /** Broadcasts a payload to every subscriber of `topic`. Called by module
   *  server code after it has durably persisted whatever the payload means —
   *  the hub does not persist anything itself. `excludeClientId` lets a
   *  REST-originated publish (no live socket) pass undefined; a WS-originated
   *  one passes the sender's id so it doesn't get its own echo. */
  publish(topic: string, payload: unknown, excludeClientId?: string): void {
    const room = this.#rooms.get(topic)
    if (!room) return
    for (const clientId of room) {
      if (clientId === excludeClientId) continue
      const client = this.#clients.get(clientId)
      if (!client) continue
      this.#send(client.ws, { type: 'event', topic, payload, senderId: excludeClientId ?? 'server' })
    }
  }

  /** Number of live subscribers on a topic — handy for "who's here" UI. */
  subscriberCount(topic: string): number {
    return this.#rooms.get(topic)?.size ?? 0
  }

  #handle(client: Client, msg: RealtimeEnvelopeIn): void {
    if (!msg.topic) {
      this.#send(client.ws, { type: 'error', message: 'missing topic' })
      return
    }
    switch (msg.type) {
      case 'sub':
        client.topics.add(msg.topic)
        this.#room(msg.topic).add(client.id)
        this.#send(client.ws, { type: 'ack', topic: msg.topic })
        return
      case 'unsub':
        client.topics.delete(msg.topic)
        this.#rooms.get(msg.topic)?.delete(client.id)
        return
      case 'pub':
        this.publish(msg.topic, msg.payload, client.id)
        return
      default:
        this.#send(client.ws, { type: 'error', message: 'unknown message type' })
    }
  }

  #room(topic: string): Set<string> {
    let room = this.#rooms.get(topic)
    if (!room) {
      room = new Set()
      this.#rooms.set(topic, room)
    }
    return room
  }

  #removeClient(id: string): void {
    const client = this.#clients.get(id)
    if (!client) return
    for (const topic of client.topics) {
      this.#rooms.get(topic)?.delete(id)
    }
    this.#clients.delete(id)
  }

  #send(ws: WebSocket, msg: RealtimeEnvelopeOut): void {
    if (ws.readyState !== ws.OPEN) return
    ws.send(JSON.stringify(msg))
  }
}
