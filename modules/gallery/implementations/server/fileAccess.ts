// The storage capability the platform injects into the gallery server impl.
// Gallery never imports from platforms/* — the platform builds this from its
// own file helpers (safePathWithin / serveFile / mimeFor) and hands it over,
// the same philosophy as spaces being injected host-side in MuralProvider.

import type { Request, Response } from 'express'

export interface GalleryFileAccess {
  /** Absolute path of the NAS root all media paths are relative to. */
  root: string
  /** Resolve a root-relative path to a confined absolute path, or null if it escapes. */
  resolve(rel: string): string | null
  /** Stream a file with correct MIME + HTTP Range support (video scrubbing). */
  serve(abs: string, req: Request, res: Response): void
  /** Best-effort MIME type for a path ('' when unknown). */
  mimeFor(p: string): string
  /** Directory where generated thumbnails live (outside the NAS root). */
  thumbDir: string
}
