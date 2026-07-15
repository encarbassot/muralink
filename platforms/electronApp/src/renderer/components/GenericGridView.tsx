import { useEffect, useState } from 'react'
import type { GridItem, AppContentProvider } from '@/types/navigation'
import { useNavigation } from '@/stores/navigationStore'
import { GridItemCell } from './GridItemCell'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { ZoomPicker } from './ZoomPicker'

interface Props {
  nodeId: string
  provider: AppContentProvider
}

interface Menu {
  x: number
  y: number
  item: GridItem | null
}

export function GenericGridView({ nodeId, provider }: Props) {
  const refreshToken = useNavigation((s) => s.refreshToken)
  const gridZoom = useNavigation((s) => s.gridZoom)
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

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-auto p-4 relative"
      style={{ background: 'var(--bg-panel)' }}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY, item: null })
      }}
    >
      {error && (
        <div style={{ color: 'var(--sync-external-blocked, #d2554e)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {!error && items.length === 0 && (
        <div style={{ color: 'var(--fg-faint)', fontSize: 12 }}>empty</div>
      )}

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${48 + gridZoom * 16}px, 1fr))` }}
      >
        {items.map((item) => (
          <GridItemCell
            key={item.id}
            item={item}
            zoom={gridZoom}
            selected={selectedByNode[nodeId] === item.id}
            onClick={() => handleItemClick(item)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setMenu({ x: e.clientX, y: e.clientY, item })
            }}
          />
        ))}
      </div>

      <ZoomPicker />

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
