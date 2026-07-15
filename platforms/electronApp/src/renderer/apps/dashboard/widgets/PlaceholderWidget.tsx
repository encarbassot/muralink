import type { BentoSize } from '@muralink/ui'

const MODULE_META: Record<string, { label: string; icon: string; hint: string }> = {
  'notes-placeholder': { label: 'Notes', icon: '📝', hint: 'notes module coming soon' },
  'calendar-placeholder': { label: 'Calendar', icon: '📅', hint: 'calendar module coming soon' },
}

interface Props {
  moduleId: string
  size: BentoSize
}

export function PlaceholderWidget({ moduleId, size: _size }: Props) {
  const meta = MODULE_META[moduleId] ?? { label: moduleId, icon: '📦', hint: 'module coming soon' }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: 0.5,
      }}
    >
      <div style={{ fontSize: 32 }}>{meta.icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{meta.label}</div>
      <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{meta.hint}</div>
    </div>
  )
}
