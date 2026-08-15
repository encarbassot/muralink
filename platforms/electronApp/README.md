# platforms/electronApp

The desktop runtime. Finder-style Miller columns over your real filesystem, with
the same dashboard the web app renders — the first platform that touches local
files directly rather than through an API.

```sh
npm run dev -w @muralink/platform-electron
```

## What lives here

- **[src/main/](src/main/)** — the Electron main process: windows, the
  filesystem bridge, and the connection to the orchester daemon over its unix
  socket.
- **[src/preload/](src/preload/)** — the context bridge. The only surface the
  renderer can reach.
- **[src/renderer/](src/renderer/)** — the UI, mounting `@muralink/app`.

## Rules

- **The renderer never gets Node.** Every privileged capability crosses the
  preload bridge explicitly; anything else is a security bug, not a shortcut.
- **The desktop app is a mount of the shared app**, not a fork of it. Behaviour
  that differs from web arrives through the injected environment.
- The orchester daemon is shared with the CLI — the desktop app attaches to it,
  it does not start a second one.
