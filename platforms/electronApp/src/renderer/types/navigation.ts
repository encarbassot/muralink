import type React from 'react'
import type { MenuItem } from '@/components/ContextMenu'

export interface NavNode {
  id: string
  label: string
  icon?: string
  appId: string
  parentId: string | null
  meta?: Record<string, unknown>
}

export interface GridItem {
  id: string
  label: string
  icon?: string
  contentType: string
  isNavigable: boolean
  meta?: Record<string, unknown>
}

export interface AppContentProvider {
  getChildren(nodeId: string): Promise<GridItem[]>
  resolveNode(item: GridItem): NavNode | null
  getContextMenu?(item: GridItem, helpers: ContextMenuHelpers): MenuItem[]
}

export interface ContextMenuHelpers {
  refresh: () => void
}

export interface AppDescriptor {
  id: string
  name: string
  icon: string
  rootNode: NavNode
  createProvider(): AppContentProvider
  component?: React.ComponentType
}

export interface CellProps {
  item: GridItem
  zoom: number
  selected?: boolean
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onDragStart?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}
