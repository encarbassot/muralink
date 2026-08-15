# @muralink/module-video-editor

Layered video and photo editing where the edit is the document. Originals stay
where they are; what syncs is an append-only log of operations.

That choice is the module: a 4 GB video never travels, and two people editing
the same project exchange kilobytes of intent instead of fighting over a file.

## What lives here

- **[manifest.ts](manifest.ts)** — `YProject`, `YOp` (one operation) and
  `YAsset` (a reference to something in storage).
- **[implementations/web/ProjectRoom.tsx](implementations/web/ProjectRoom.tsx)** —
  the collaborative room.
- **[implementations/server/](implementations/server/)** — the op-log and the
  `/api/video-editor` routes.

## Rules

- **Originals are referenced by path**, never copied into the module and never
  modified. Export renders a new file; it does not overwrite the source.
- **Ops are append-only.** Undo is a new op, not a deletion — that is what makes
  the log replayable and mergeable.
- **Realtime is a transport, not a store.** [`@muralink/realtime`](../../packages/realtime)
  fans out live changes; anything that must survive a disconnect is persisted by
  this module.
