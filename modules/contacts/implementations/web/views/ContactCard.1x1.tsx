import type { YContact } from '../../../types.ts'

interface Props {
  contact: YContact
  onClick?: () => void
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

export function ContactCard({ contact, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: 8, cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit',
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: 'var(--accent, #b5936a)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 700,
      }}>
        {initials(contact.name)}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'center' }}>{contact.name}</div>
      {contact.phone && (
        <div style={{ fontSize: 11, color: 'var(--muted-foreground, #6b6560)' }}>{contact.phone.number}</div>
      )}
    </div>
  )
}
