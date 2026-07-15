import type React from 'react'
import type { ReactNode } from 'react'
import { AppShell } from '@muralink/ui'
import type { DockItem } from './types.js'
import { Dock } from './Dock.js'

interface ShellFrameProps {
  dockItems: DockItem[]
  children: ReactNode
  style?: React.CSSProperties
}

export function ShellFrame({ dockItems, children, style }: ShellFrameProps) {
  return (
    <AppShell
      shellGap={0}
      sidebar={<Dock items={dockItems} />}
      style={{ height: '100%', boxSizing: 'border-box', ...style }}
    >
      {children}
    </AppShell>
  )
}
