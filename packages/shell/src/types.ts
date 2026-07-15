import type { ComponentType, ReactNode } from 'react'
import type { GridPersistenceAdapter } from '@muralink/types'

export type DockItem =
  | {
      type: 'button'
      id: string
      icon: ReactNode
      label?: string
      onClick: () => void
      active?: boolean
    }
  | {
      type: 'widget'
      id: string
      icon: ReactNode
      label?: string
      /** Rendered at 32×32 in the dock; hover expands to full widget */
      component: ComponentType<{ compact: boolean }>
    }
  | {
      type: 'slot'
      id: string
      /** Platform injects arbitrary content (e.g. DaemonPanel) */
      content: ReactNode
    }

export interface ShellAppProps {
  dockItems: DockItem[]
  layoutId: string
  persistenceAdapter?: GridPersistenceAdapter
}
