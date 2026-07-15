// Electron dashboard cells, expressed as shared CellModules. Registered into a
// CellRegistry by DashboardApp. render() receives the CellContext (openApp,
// goToDrawer, navigateTo) the platform supplies — no store access here.

import type { CellModule, CellContext } from '@muralink/shell'
import { ClockWidget } from './widgets/ClockWidget'
import { WelcomeWidget } from './widgets/WelcomeWidget'
import { AppLinkWidget } from './widgets/AppLinkWidget'
import { LayoutWidget } from './widgets/LayoutWidget'

function appLinkAction(ctx: CellContext, instanceId?: string): (() => void) | undefined {
  if (instanceId === 'apps') return ctx.goToDrawer
  if (instanceId) return () => ctx.openApp?.(instanceId)
  return undefined
}

export const ELECTRON_CELLS: CellModule[] = [
  {
    descriptor: {
      moduleId: 'clock',
      label: 'Clock',
      icon: '🕐',
      description: 'Live clock with time zone support',
      defaultSize: '1x1',
      availableSizes: ['1x1', '2x1'],
    },
    render: (cell) => <ClockWidget size={cell.size} />,
  },
  {
    descriptor: {
      moduleId: 'welcome',
      label: 'Welcome',
      icon: '👋',
      description: 'Welcome banner with quick info',
      defaultSize: '2x1',
      availableSizes: ['2x1', '3x2', '2x2'],
    },
    render: (cell) => <WelcomeWidget size={cell.size} />,
  },
  {
    descriptor: {
      moduleId: 'app-link',
      label: 'App link',
      icon: '⊞',
      description: 'Shortcut to any installed app',
      defaultSize: '1x1',
      availableSizes: ['1x1'],
    },
    render: (cell, ctx) => (
      <AppLinkWidget
        size={cell.size}
        instanceId={cell.instanceId}
        onClick={appLinkAction(ctx, cell.instanceId)}
      />
    ),
  },
  {
    descriptor: {
      moduleId: 'layout',
      label: 'Folder',
      icon: '📂',
      description: 'Group modules into a sub-layout',
      defaultSize: '2x2',
      availableSizes: ['1x1', '2x1', '1x2', '2x2'],
    },
    render: (cell, ctx) => (
      <LayoutWidget
        layoutId={cell.instanceId ?? cell.id}
        size={cell.size}
        onClick={() => ctx.navigateTo?.(cell.instanceId ?? cell.id)}
      />
    ),
  },
]
