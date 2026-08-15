// Sharing injection seam. Hosts that can mint mural share links (the cloud
// master today; the tunnel-connected orchester in the future) inject their
// implementation here. No host → the share menu simply doesn't render.
// V1 semantics: every share is READ-ONLY; a null targetEmail is the mural's
// public link, a set targetEmail grants one mural.ink account.

export interface MuralShareEntry {
  id: string
  muralId: string
  targetEmail: string | null
  /** Opaque token; the host UI builds the guest URL from it. */
  token: string
}

export interface MuralSharing {
  list: (muralId: string) => Promise<MuralShareEntry[]>
  create: (muralId: string, targetEmail?: string) => Promise<MuralShareEntry>
  remove: (id: string) => Promise<void>
  /** Guest URL for a share token (host knows its own routing). */
  urlFor: (token: string) => string
  /** Space the mural must live in so guests can reach it (e.g. the cloud
   *  core). Murals in other spaces get a "move first" prompt in the menu. */
  requiredSpaceId?: string
}

let sharing: MuralSharing | null = null

export function setMuralSharing(s: MuralSharing): void {
  sharing = s
}

export function getMuralSharing(): MuralSharing | null {
  return sharing
}
