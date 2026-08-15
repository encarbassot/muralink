// Storage injection seam. The module cannot depend on @muralink/app (one-way
// dependency), so the host platform injects its storage client here at boot
// (packages/app passes its storageApi). Without a host — or offline — file
// features degrade cleanly: text murals keep working, uploads are disabled.

export interface MuralUploadResult {
  path: string
  size: number
}

export interface MuralStorage {
  uploadResumable: (
    dir: string,
    file: File,
    opts?: { onProgress?: (sent: number, total: number) => void; signal?: AbortSignal },
  ) => Promise<MuralUploadResult>
  serveUrl: (path: string) => string
  mkdir: (path: string) => Promise<unknown>
  /** Overwrite a text file at its ABSOLUTE storage path (markdown editing).
   *  Absent = read-only host (e.g. a shared guest). */
  saveText?: (absPath: string, content: string) => Promise<unknown>
}

let storage: MuralStorage | null = null

export function setMuralStorage(s: MuralStorage): void {
  storage = s
}

export function getMuralStorage(): MuralStorage | null {
  return storage
}
