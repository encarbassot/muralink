import type React from 'react'
import type { BentoSize } from '@muralink/ui'
import type { GridItem } from './navigation'

export interface FileElementProps {
  item: GridItem
  size: BentoSize
  selected: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export interface FileElementDef {
  defaultSize: BentoSize
  label: string
  component: React.ComponentType<FileElementProps>
}
