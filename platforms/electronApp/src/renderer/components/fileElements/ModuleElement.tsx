import type { FileElementProps } from '@/types/fileElement'

// A local module record (a note, a contact, …) rendered as a 1x1 icon cell —
// same footprint as a file, so everything on "this device" reads as one grid.
// Icon + kind badge + title come off the GridItem the local-device provider built.
export function ModuleElement({ item, selected, onClick, onContextMenu }: FileElementProps) {
  const kind = (item.meta?.kindLabel as string) ?? ''

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 12,
        background: 'var(--bg-elevated)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        overflow: 'hidden',
        boxSizing: 'border-box',
        transition: 'border-color 0.1s',
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={item.label}
    >
      <span style={{ fontSize: 40, lineHeight: 1 }}>{item.icon ?? '📄'}</span>
      {kind && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            textTransform: 'uppercase',
            color: 'var(--fg-faint)',
            letterSpacing: 1,
          }}
        >
          {kind}
        </span>
      )}
      <span
        style={{
          fontSize: 11,
          color: 'var(--fg-dim)',
          textAlign: 'center',
          width: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item.label}
      </span>
    </div>
  )
}
