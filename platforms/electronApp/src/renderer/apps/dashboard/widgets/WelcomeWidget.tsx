import type { BentoSize } from '@muralink/ui'

interface Props {
  size: BentoSize
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function WelcomeWidget({ size: _size }: Props) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '12px 16px',
        gap: 6,
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>{greeting()}</div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: 'var(--fg)',
          lineHeight: 1.2,
        }}
      >
        Your space,<br />your rules.
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>
        Drag cells to rearrange · Click ⚙ to configure grid
      </div>
    </div>
  )
}
