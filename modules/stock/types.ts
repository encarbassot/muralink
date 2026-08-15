import type { YMoney, InstanceRef } from '@muralink/types'
import type { RuleBlock } from '@muralink/calc/blocks'

export interface YStockItem {
  id: string
  name: string
  quantity: number
  unit: string
  lowStockThreshold?: number
  /** Legacy single price — kept for back-compat. New pricing lives in `pricing`. */
  price?: YMoney
  /** Rich pricing: base → gain% → final (recomputes), plus deterministic rules. */
  pricing?: YPricing
  category?: string
  /** The location this item is stored/grouped in (YLocation.id). */
  locationId?: string
  notes?: string
  updatedAt: string
}

// Excel-like price model: a base price, a gain/margin %, and a final price. Two
// of the three are inputs (chosen by `driver`) and the third is derived, so
// editing any value recomputes the others. `rules` are deterministic block-rules
// (time escalation, membership discount…) folded over the computed final price.
export interface YPricing {
  base: YMoney
  gainPct: number
  /** Which two of base/gain/final are the inputs; the third is derived. */
  driver: 'base+gain' | 'base+final' | 'gain+final'
  /** Present when `driver` includes 'final' (the user typed a final price). */
  finalOverride?: YMoney
  rules: RuleBlock[]
}

// Context a rule set is evaluated against. In the single-user core `buyer` is
// usually absent (no counterpart identity locally); it is supplied at the share/
// checkout boundary. `date` drives time-based rules (never Date.now()).
export interface PricingContext {
  buyer?: InstanceRef
  quantity: number
  date: string // ISO
}

// A physical or logical place items are grouped under (shelf, warehouse, room…).
// Single-user core: no ownership/tenant fields — just a named grouping.
export interface YLocation {
  id: string
  name: string
  description?: string
  createdAt: string
}
