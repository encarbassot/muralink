import type { CellProps, GridItem } from '@/types/navigation'

const renderers: Record<string, React.FC<CellProps>> = {}

export function registerCellRenderer(contentType: string, renderer: React.FC<CellProps>) {
  renderers[contentType] = renderer
}

function DefaultCell({ item, zoom, selected, onClick, onContextMenu, onDragStart, onDrop }: CellProps) {
  return (
    <div
      className="flex flex-col items-center gap-1 rounded px-1 py-2 transition-colors hover:bg-blue-500/10"
      style={{ cursor: 'pointer', background: selected ? 'var(--accent-dim)' : undefined }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop}
      title={item.id}
    >
      <div
        className="flex items-center justify-center rounded"
        style={{
          width: 48 + zoom * 16,
          height: 48 + zoom * 16,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          fontSize: 16 + zoom * 4,
        }}
      >
        {item.icon ?? '📦'}
      </div>
      <div
        className="w-full truncate text-center"
        style={{ color: 'var(--fg-dim)', fontSize: 10 + zoom }}
      >
        {item.label}
      </div>
    </div>
  )
}

export function GridItemCell(props: CellProps) {
  const Renderer = renderers[props.item.contentType] ?? DefaultCell
  return <Renderer {...props} />
}

export function getCellRenderer(contentType: string): React.FC<CellProps> | undefined {
  return renderers[contentType]
}
