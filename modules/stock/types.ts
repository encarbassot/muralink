import type { YMoney } from '@muralink/types'

export interface YStockItem {
  id: string
  name: string
  quantity: number
  unit: string
  lowStockThreshold?: number
  price?: YMoney
  category?: string
  notes?: string
  updatedAt: string
}
