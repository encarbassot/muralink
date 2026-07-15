// The "On click" config tab. Configures which action fires when the widget is
// clicked in view mode. The binding persists at cell.props.onClick and the parent
// (App.resolveCellClick) turns it into a concrete CellContext call. Built as a
// factory so App can inject the module's clickable methods + default label.

import { useState } from 'react'
import type { CellTab, CellTabProps, CellMethod, OnClickBinding } from '@muralink/shell'

function Row({
  selected,
  label,
  hint,
  onSelect,
  children,
}: {
  selected: boolean
  label: string
  hint?: string
  onSelect: () => void
  children?: React.ReactNode
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '9px 11px',
        borderRadius: 9,
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        background: selected ? 'var(--accent-dim, rgba(76,159,255,0.12))' : 'var(--bg)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: `2px solid ${selected ? 'var(--accent)' : 'var(--border-strong, var(--border))'}`,
            background: selected ? 'var(--accent)' : 'transparent',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>{label}</span>
        {hint && <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function OnClickTabBody({
  cell,
  setConfig,
  clickable,
  defaultLabel,
}: CellTabProps & { clickable: CellMethod[]; defaultLabel: string }) {
  const current = cell.props?.onClick as OnClickBinding | undefined
  const [url, setUrl] = useState(current?.kind === 'url' ? current.url : '')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row
        selected={!current}
        label="Default"
        hint={defaultLabel}
        onSelect={() => setConfig(undefined)}
      />
      {clickable.map((m) => (
        <Row
          key={m.id}
          selected={current?.kind === 'method' && current.methodId === m.id}
          label={`${m.icon ? m.icon + ' ' : ''}${m.label}`}
          onSelect={() => setConfig({ kind: 'method', methodId: m.id } as OnClickBinding)}
        />
      ))}
      <Row
        selected={current?.kind === 'openModal'}
        label="Abrir vista completa"
        onSelect={() => setConfig({ kind: 'openModal' } as OnClickBinding)}
      />
      <Row
        selected={current?.kind === 'url'}
        label="Abrir URL…"
        onSelect={() => setConfig({ kind: 'url', url } as OnClickBinding)}
      >
        {current?.kind === 'url' && (
          <input
            value={url}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              setUrl(e.target.value)
              setConfig({ kind: 'url', url: e.target.value } as OnClickBinding)
            }}
            placeholder="https://…"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '7px 9px',
              borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--fg)',
              fontSize: 12,
              outline: 'none',
            }}
          />
        )}
      </Row>
      <Row
        selected={current?.kind === 'none'}
        label="No hacer nada"
        onSelect={() => setConfig({ kind: 'none' } as OnClickBinding)}
      />
    </div>
  )
}

export function makeOnClickTab(opts: { methods: CellMethod[]; defaultLabel: string }): CellTab {
  const clickable = opts.methods.filter((m) => m.clickable !== false)
  return {
    id: 'onClick',
    label: 'On click',
    icon: '👆',
    render: (p) => <OnClickTabBody {...p} clickable={clickable} defaultLabel={opts.defaultLabel} />,
  }
}
