import type { YMoney, YDateTime } from '@muralink/types'

export type StockMovementType = 'in' | 'out' | 'adjustment'

export interface YItem {
  id: string
  name: string
  sku?: string
  category?: string
  quantity: number
  unit: string
  minStock?: number
  price?: YMoney
  createdAt: YDateTime
}

export interface YStockMovement {
  id: string
  itemId: string
  type: StockMovementType
  quantity: number
  reason?: string
  performedAt: YDateTime
}
