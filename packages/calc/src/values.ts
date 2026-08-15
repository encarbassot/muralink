// Cell values — the universal currency of the engine. Every cell, every formula
// sub-expression, and every function argument/result is a CellValue. Blank is
// `null` (distinct from the empty string), so ISBLANK is exactly `=== null`.
// Errors are values too (Excel semantics): they propagate through arithmetic
// instead of throwing, so one bad cell never blanks the whole sheet.

export type CalcErrorCode = 'CYCLE' | 'REF' | 'DIV0' | 'NAME' | 'VALUE' | 'NUM'

export interface CalcError {
  kind: 'error'
  code: CalcErrorCode
  message: string
}

/** A resolved value. `null` = blank cell. */
export type CellValue = number | string | boolean | null | CalcError

export function err(code: CalcErrorCode, message: string): CalcError {
  return { kind: 'error', code, message }
}

export function isError(v: CellValue): v is CalcError {
  return typeof v === 'object' && v !== null && (v as CalcError).kind === 'error'
}

export function isBlank(v: CellValue): boolean {
  return v === null
}

// ── Coercions (deterministic, locale-free) ──────────────────────────────────
// No Intl, no Number.prototype.toLocaleString, no Date. A number is a number in
// every environment; string parsing is strict decimal only.

/** Coerce to a number for arithmetic. Blank → 0, bool → 0/1, numeric string →
 *  its value, non-numeric string → VALUE error, error → itself. */
export function toNumber(v: CellValue): number | CalcError {
  if (isError(v)) return v
  if (v === null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const trimmed = v.trim()
  if (trimmed === '') return 0
  // Strict decimal: optional sign, digits, optional fraction/exponent.
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(trimmed)) {
    return err('VALUE', `"${v}" is not a number`)
  }
  return Number(trimmed)
}

/** Coerce to a boolean for logical context. Blank/0/"" → false. */
export function toBoolean(v: CellValue): boolean | CalcError {
  if (isError(v)) return v
  if (v === null) return false
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const t = v.trim().toLowerCase()
  if (t === 'true') return true
  if (t === 'false' || t === '') return false
  return true
}

/** Coerce to a display string. Errors render as their code (e.g. "#CYCLE"). */
export function toText(v: CellValue): string {
  if (v === null) return ''
  if (isError(v)) return `#${v.code}`
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v)
}
