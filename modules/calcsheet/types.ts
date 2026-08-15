// The calcsheet payload. A sheet is a set of formula cells, global variables,
// reusable user functions, and block rules — all evaluated by @muralink/calc.
// Persisted as an Instance<YCalcSheet> (or inline in a bento cell's props),
// mirroring how YStockItem is the data of a stock.item instance.

import type { CellDef, GlobalVar } from '@muralink/calc'
import type { UserFn } from '@muralink/calc/sandbox'
import type { RuleBlock } from '@muralink/calc/blocks'

export interface YCalcSheet {
  id: string
  title?: string
  /** cellId ('A1') → its source ('' | literal | '=formula'). */
  cells: Record<string, string>
  globals: GlobalVar[]
  functions: UserFn[]
  rules: RuleBlock[]
  /** Grid dimensions shown in the editor. */
  cols?: number
  rows?: number
  updatedAt?: string
}

export type { CellDef, GlobalVar }

/** A blank sheet. */
export function emptySheet(id: string): YCalcSheet {
  return { id, cells: {}, globals: [], functions: [], rules: [], cols: 5, rows: 10 }
}
