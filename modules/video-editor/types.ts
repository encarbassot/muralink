// video-editor module types — the sync contract shared by every client
// (Android, desktop, this web view). Two things are kept deliberately
// separate:
//
//   - YProject / YAsset: small metadata rows, queried directly.
//   - YOp: the append-only op-log. This is the ONLY thing that syncs in real
//     time between devices. It never carries media bytes — a clip trim, an
//     added layer, a shader param change and a "note" annotation are all just
//     an YOp with a `type` string and an opaque `payload`. The server stores
//     and relays ops without understanding them; each client folds the log
//     into its own local project state. This is what lets "upload the
//     original once, sync only the edits" work: every device already has (or
//     lazily clones, once, via /api/storage) the same source media, so
//     replaying the same ops over it deterministically produces the same
//     preview on every device.
//
// Concurrency: ops are ordered by LamportStamp, not by server arrival time.
// Each client keeps a local Lamport counter — bumped past any stamp it
// observes from a remote op — so two devices editing the same project fully
// offline and syncing later still merge into one causally-consistent order.
// The server is just a durable, ordered mailbox; it does not resolve
// conflicts (last-writer-wins at the field level is the client's job, same
// as any op-log CRDT).

export interface LamportStamp {
  /** Strictly increasing per actor; ties broken by actorId. */
  counter: number
  actorId: string
}

/** Compares two stamps for total order. <0 if a before b, >0 if after. */
export function compareLamportStamp(a: LamportStamp, b: LamportStamp): number {
  if (a.counter !== b.counter) return a.counter - b.counter
  return a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0
}

export interface YProject {
  id: string
  name: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

/**
 * A registered media original. The file itself lives under /api/storage at
 * `storagePath` (uploaded once by whichever device recorded/imported it);
 * other devices clone it by downloading that path, then never touch it
 * again. Registering an asset is itself an op (`asset.register`) so its
 * arrival syncs through the same log as everything else.
 */
export interface YAsset {
  id: string
  projectId: string
  storagePath: string // path under the NAS root, as returned by /api/storage/list
  durationMs: number
  width?: number
  height?: number
  sha256?: string // lets a cloning device verify it got the exact same bytes
}

/**
 * One entry in a project's append-only op-log. `type` and `payload` are
 * intentionally opaque to the server — see file header. Suggested `type`
 * values a client will actually emit (not enforced here):
 *   asset.register   { asset: YAsset }
 *   clip.add          { clipId, assetId, trackId, timelineStartMs, sourceInMs, sourceOutMs }
 *   clip.trim         { clipId, sourceInMs, sourceOutMs }
 *   clip.move         { clipId, timelineStartMs }
 *   clip.remove       { clipId }
 *   layer.modifier.set{ layerId, key, value }   // shader/filter/overlay params
 *   layover.note.add  { noteId, timelineMs, text, author }
 *   playhead.set       { deviceId, ms }           // ephemeral-ish presence of "what I'm looking at"
 */
export interface YOp {
  id: string // uuid, dedup key — retrying a POST is safe
  projectId: string
  stamp: LamportStamp
  type: string
  payload: unknown
  createdAt: string // server receipt time; informational only, not used for ordering
}
