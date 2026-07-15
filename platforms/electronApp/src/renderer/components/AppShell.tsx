import { useEffect, useMemo } from 'react'
import { usePlatform } from '@/stores/platformStore'
import { useNavigation } from '@/stores/navigationStore'
import { GenericColumnView } from './GenericColumnView'
import { GenericGridView } from './GenericGridView'
import { BentoFileView } from './BentoFileView'

export function AppShell() {
  const activeAppId = usePlatform((s) => s.activeAppId)
  const installedApps = usePlatform((s) => s.installedApps)
  const viewMode = useNavigation((s) => s.viewMode)
  const splitMode = useNavigation((s) => s.splitMode)
  const stack = useNavigation((s) => s.stack)
  const reset = useNavigation((s) => s.reset)

  const app = installedApps.find((a) => a.id === activeAppId)
  const provider = useMemo(() => app?.createProvider(), [app])

  useEffect(() => {
    if (app && stack.length === 0) {
      reset(app.rootNode)
    }
  }, [app, stack.length, reset])

  if (!app) return null

  if (app.component) {
    const Component = app.component
    return <Component />
  }

  if (!provider) return null

  const currentNodeId = stack[stack.length - 1]?.id
  if (!currentNodeId) return null

  if (viewMode === 'bento') {
    return <BentoFileView nodeId={currentNodeId} provider={provider} />
  }

  if (splitMode) {
    const parentIdx = Math.max(0, stack.length - 2)
    const parentNodeId = stack[parentIdx]?.id
    const currentNode = stack[stack.length - 1]?.id
    return (
      <div className="flex min-h-0 flex-1" style={{ gap: 'var(--bento-gap)' }}>
        <div
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          style={{
            borderRadius: 'var(--bento-radius)',
            border: '1px solid var(--border)',
            background: 'var(--bg-panel)',
          }}
        >
          {parentNodeId && (
            <GenericGridView nodeId={parentNodeId} provider={provider} />
          )}
        </div>
        <div
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          style={{
            borderRadius: 'var(--bento-radius)',
            border: '1px solid var(--border)',
            background: 'var(--bg-panel)',
          }}
        >
          {currentNode && (
            <GenericGridView nodeId={currentNode} provider={provider} />
          )}
        </div>
      </div>
    )
  }

  if (viewMode === 'columns') {
    return <GenericColumnView provider={provider} />
  }

  return <GenericGridView nodeId={currentNodeId} provider={provider} />
}
