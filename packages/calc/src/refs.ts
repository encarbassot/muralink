// A1-notation ↔ coordinate conversion. Columns are base-26 bijective (A..Z,
// AA..AZ, …), rows are 1-based. Pure and deterministic. Ranges expand to the
// inclusive rectangle of cell ids.

export interface Coord {
  col: number // 0-based
  row: number // 0-based
}

const A1_RE = /^([A-Za-z]+)(\d+)$/

/** 'A1' → { col:0, row:0 }. Returns null for malformed refs. */
export function parseRef(ref: string): Coord | null {
  const m = A1_RE.exec(ref)
  if (!m) return null
  const letters = m[1]!.toUpperCase()
  const digits = m[2]!
  let col = 0
  for (const ch of letters) col = col * 26 + (ch.charCodeAt(0) - 64) // A=1
  const row = Number(digits)
  if (row < 1) return null
  return { col: col - 1, row: row - 1 }
}

/** { col:0, row:0 } → 'A1'. */
export function formatRef(coord: Coord): string {
  let col = coord.col + 1
  let letters = ''
  while (col > 0) {
    const rem = (col - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    col = Math.floor((col - 1) / 26)
  }
  return `${letters}${coord.row + 1}`
}

/** Normalize casing so 'a1' and 'A1' are the same cell id. */
export function normalizeRef(ref: string): string {
  const c = parseRef(ref)
  return c ? formatRef(c) : ref.toUpperCase()
}

/** 'A1','B3' → ['A1','B1','A2','B2','A3','B3'] (inclusive rectangle). Empty when
 *  either endpoint is malformed. */
export function expandRange(from: string, to: string): string[] {
  const a = parseRef(from)
  const b = parseRef(to)
  if (!a || !b) return []
  const c0 = Math.min(a.col, b.col)
  const c1 = Math.max(a.col, b.col)
  const r0 = Math.min(a.row, b.row)
  const r1 = Math.max(a.row, b.row)
  const out: string[] = []
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) out.push(formatRef({ col, row }))
  }
  return out
}
