import { useEffect, useState } from 'react'
import type { GridItem, AppContentProvider } from '@/types/navigation'
import type { MenuItem } from './ContextMenu'
import { useNavigation } from '@/stores/navigationStore'
import { ContextMenu } from './ContextMenu'

interface Props {
  nodeId: string
  provider: AppContentProvider
}

interface Menu {
  x: number
  y: number
  item: GridItem | null
}

export function GenericColumn({ nodeId, provider }: Props) {
  const refreshToken = useNavigation((s) => s.refreshToken)
  const selectedByNode = useNavigation((s) => s.selectedByNode)
  const pushNode = useNavigation((s) => s.pushNode)
  const selectItem = useNavigation((s) => s.selectItem)
  const setPreview = useNavigation((s) => s.setPreview)
  const popToIndex = useNavigation((s) => s.popToIndex)
  const stack = useNavigation((s) => s.stack)
  const refresh = useNavigation((s) => s.refresh)

  const [items, setItems] = useState<GridItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)

  const selectedChild = selectedByNode[nodeId]

  useEffect(() => {
    let alive = true
    provider
      .getChildren(nodeId)
      .then((list) => alive && (setItems(list), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => { alive = false }
  }, [nodeId, refreshToken, provider])

  function handleItemClick(item: GridItem) {
    selectItem(nodeId, item.id)
    if (item.isNavigable) {
      const node = provider.resolveNode(item)
      if (node) {
        const idx = stack.findIndex((n) => n.id === nodeId)
        if (idx >= 0) popToIndex(idx)
        pushNode(node)
      }
    } else {
      setPreview(item)
    }
  }

  function getMenuItems(item: GridItem): MenuItem[] {
    if (!provider.getContextMenu) return []
    return provider.getContextMenu(item, { refresh })
  }

  const label = stack.find((n) => n.id === nodeId)?.label ?? ''

  return (
    <div
      className="flex h-full shrink-0 flex-col border-r"
      style={{ width: 'var(--col-w)', background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY, item: null })
      }}
    >
      <div
        className="truncate border-b px-2 py-1 text-[11px] uppercase tracking-wide"
        style={{ color: 'var(--fg-faint)', borderColor: 'var(--border)' }}
      >
        {label}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {error && (
          <div className="px-2 py-1 text-[11px]" style={{ color: 'var(--sync-external-blocked, #d2554e)' }}>
            {error}
          </div>
        )}
        {!error && items.length === 0 && (
          <div className="px-2 py-1 text-[11px]" style={{ color: 'var(--fg-faint)' }}>empty</div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex cursor-pointer items-center gap-2 px-2 transition-colors hover:bg-blue-500/10"
            style={{
              height: 'var(--row-h)',
              background: selectedChild === item.id ? 'var(--accent-dim)' : undefined,
              color: 'var(--fg)',
            }}
            onClick={() => handleItemClick(item)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setMenu({ x: e.clientX, y: e.clientY, item })
            }}
          >
            <span className="text-[13px] leading-none">{item.icon ?? '📦'}</span>
            <span className="min-w-0 flex-1 truncate text-[12px]">{item.label}</span>
            {item.isNavigable && (
              <span className="text-[10px]" style={{ color: 'var(--fg-faint)' }}>›</span>
            )}
          </div>
        ))}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.item ? getMenuItems(menu.item) : []}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
