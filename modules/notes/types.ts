// notes module types. A local-first markdown note. Body is raw markdown,
// rendered in-place by the CodeMirror editor (no separate preview).

export interface YNote {
  id: string
  title: string
  body: string
  color?: string
  createdBy?: string // user id, for shared spaces
  updatedAt: string
  // Which storage space currently holds this note (runtime-only, stamped on
  // read by @muralink/spaces — never persisted in the payload).
  spaceId?: string
}
