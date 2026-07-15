import type { FileElementProps } from '@/types/fileElement'

export function DefaultFileElement({ item, selected, onClick, onContextMenu }: FileElementProps) {
  const ext = (item.meta?.ext as string) ?? ''

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
      title={item.id}
    >
      <span style={{ fontSize: 40, lineHeight: 1 }}>{ext ? '📄' : '❓'}</span>
      {ext && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            textTransform: 'uppercase',
            color: 'var(--fg-faint)',
            letterSpacing: 1,
          }}
        >
          {ext}
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
