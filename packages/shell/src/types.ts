import type { ComponentType, ReactNode } from 'react'
import type { GridPersistenceAdapter } from '@muralink/types'

// Quick action revealed when hovering a dock button's label flyout.
export interface DockMenuItem {
  id: string
  label: string
  icon?: ReactNode
  onClick: () => void
}

// `bottom: true` pins an entry to the dock's lower section (after a flexible
// spacer) — e.g. the account/user menu.
export type DockItem =
  | {
      type: 'button'
      id: string
      icon: ReactNode
      label?: string
      onClick: () => void
      active?: boolean
      bottom?: boolean
      /** Extra options shown when the hover label itself is hovered. */
      menu?: DockMenuItem[]
    }
  | {
      type: 'widget'
      id: string
      icon: ReactNode
      label?: string
      /** Rendered at 32×32 in the dock; hover expands to full widget */
      component: ComponentType<{ compact: boolean }>
      bottom?: boolean
    }
  | {
      type: 'slot'
      id: string
      /** Platform injects arbitrary content (e.g. DaemonPanel) */
      content: ReactNode
      bottom?: boolean
    }

export interface ShellAppProps {
  dockItems: DockItem[]
  layoutId: string
  persistenceAdapter?: GridPersistenceAdapter
}
