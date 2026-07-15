import { useEffect, useRef, useState } from 'react'
import { BentoGrid, BentoCell, bentoSizeToCols } from '@muralink/ui'
import type { GridItem, AppContentProvider } from '@/types/navigation'
import { useNavigation } from '@/stores/navigationStore'
import { fileElementRegistry } from '@/lib/fileElementRegistry'
import { ContextMenu, type MenuItem } from './ContextMenu'

interface Props {
  nodeId: string
  provider: AppContentProvider
}

interface Menu {
  x: number
  y: number
  item: GridItem | null
}

const CELL_SIZE = 160
const GAP = 10

export function BentoFileView({ nodeId, provider }: Props) {
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
  const [cols, setCols] = useState(4)
  const [, forceRender] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? el.clientWidth
      setCols(Math.max(1, Math.floor(w / (CELL_SIZE + GAP))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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

  function buildMenuItems(item: GridItem): MenuItem[] {
    const providerItems = provider.getContextMenu ? provider.getContextMenu(item, { refresh }) : []
    const ext = (item.meta?.ext as string) ?? ''
    const alternatives = fileElementRegistry.listAlternatives(item.contentType)

    if (alternatives.length > 1) {
      const viewAsItems: MenuItem[] = alternatives.map(({ key, label }) => ({
        label: `View as: ${label}`,
        onClick: () => {
          fileElementRegistry.setOverride(item.id, key)
          forceRender((n) => n + 1)
        },
      }))
      return [...viewAsItems, ...providerItems]
    }

    void ext
    return providerItems
  }

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: 16,
        background: 'var(--bg-panel)',
      }}
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

      <BentoGrid cols={cols} cellSize={CELL_SIZE} gap={GAP}>
        {items.map((item) => {
          const ext = (item.meta?.ext as string) ?? ''
          const def = fileElementRegistry.resolve(item.contentType, ext, item.id)
          const { cols: cellCols, rows: cellRows } = bentoSizeToCols(def.defaultSize)
          const Element = def.component
          const selected = selectedByNode[nodeId] === item.id

          return (
            <BentoCell
              key={item.id}
              cols={cellCols}
              rows={cellRows}
              style={{ borderRadius: 8 }}
            >
              <Element
                item={item}
                size={def.defaultSize}
                selected={selected}
                onClick={() => handleItemClick(item)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenu({ x: e.clientX, y: e.clientY, item })
                }}
              />
            </BentoCell>
          )
        })}
      </BentoGrid>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.item ? buildMenuItems(menu.item) : []}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
