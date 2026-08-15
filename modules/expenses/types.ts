import type { YMoney, YDateTime, YUrl } from '@muralink/types'

// Who put the value in for a movement. Redundant with the sign of `amount` for
// non-zero movements, but stored explicitly so a 0-value movement (a barter /
// "nevera" wash in the source sheet) still records who provided it.
export type ProvidedBy = 'me' | 'them'

// One movement in an A↔B ledger. `amount` is SIGNED from the local user's
// ("me") perspective: positive = the counterparty owes me more (I provided),
// negative = I owe the counterparty (they provided). The running balance is the
// cumulative sum — never stored, always derived (see balanceOf).
export interface YExpenseEntry {
  id: string
  accountId: string // = the counterparty's contact id
  amount: YMoney // signed; + falls in my favour
  providedBy: ProvidedBy
  description: string
  dateText?: string // free text — supports ranges "21/01/25 - 9/02/25" or empty
  hours?: number // informative metadata (worked hours behind the value)
  km?: number // informative metadata (km behind the value)
  notes?: string
  url?: YUrl // long reference links (Amazon, supplier pages…)
  createdAt: YDateTime // ledger order: oldest → newest, like the source sheet
  updatedAt?: string
  // Which storage space holds this entry (stamped on read by @muralink/spaces).
  spaceId?: string
}

// The whole module is single-currency for now. EUR, 2 decimals, stored as
// integer minor units (627,01 € → amount 62701) so sums never drift.
export const CURRENCY = 'EUR'
export const PRECISION = 2

const FACTOR = 10 ** PRECISION

/** Build a YMoney from a major-unit amount (e.g. 627.01 → 62701 minor units). */
export function euros(major: number): YMoney {
  return { amount: Math.round(major * FACTOR), currency: CURRENCY, precision: PRECISION }
}

/** YMoney → major units as a JS number (627.01). */
export function toNumber(m: YMoney): number {
  return m.amount / 10 ** m.precision
}

/** Running balance of an account = signed sum of every movement's amount. */
export function balanceOf(entries: YExpenseEntry[]): YMoney {
  const total = entries.reduce((sum, e) => sum + e.amount.amount, 0)
  return { amount: total, currency: CURRENCY, precision: PRECISION }
}

/** Locale-formatted money string, e.g. "627,01 €". */
export function formatMoney(m: YMoney): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: m.currency }).format(toNumber(m))
}
