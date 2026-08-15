# @muralink/realtime

A generic WebSocket topic bus for the core server. One endpoint, rooms keyed by
whatever string a module cares about. It knows nothing about what the messages
mean.

```ts
const server = http.createServer(app)
const hub = attachRealtime(server, { verifyToken: isValidToken })

// a module publishes to a topic it owns
hub.publish(`project:${id}`, { kind: 'cursor', ... })
```

## What lives here

- **[src/attach.ts](src/attach.ts)** — `attachRealtime(server, opts)`. Handles
  the HTTP upgrade at `/api/realtime`, validates the token from the query string
  and hands the socket to the hub.
- **[src/hub.ts](src/hub.ts)** — `RealtimeHub`: subscribe, unsubscribe, publish.

## Rules

- **No domain knowledge.** The bus does not know what a project, a mural or a
  cursor is. The first consumer was the video-editor module; it is a consumer,
  not the owner.
- **Auth happens at the handshake.** The upgrade runs before Express, so the
  token is validated here rather than by the usual middleware. Same rule,
  different entry point — see `isValidToken` in the server's auth middleware.
- **Nothing is durable.** Messages are fan-out only: no history, no replay, no
  delivery guarantee. A module that needs any of that persists it itself.
