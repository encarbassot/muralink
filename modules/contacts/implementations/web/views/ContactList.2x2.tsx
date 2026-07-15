import { useState } from 'react'
import type { YContact } from '../../../types.ts'

interface Props {
  contacts?: YContact[]
  onContactClick?: (contact: YContact) => void
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

export function ContactList({ contacts = [], onContactClick }: Props) {
  const [search, setSearch] = useState('')
  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.address.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.number.includes(search),
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'inherit' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border, #d4cfc9)' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          style={{
            width: '100%',
            border: '1px solid var(--border, #d4cfc9)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 13,
            outline: 'none',
            background: 'var(--background, #f9f7f4)',
            boxSizing: 'border-box',
          }}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.map(contact => (
          <div
            key={contact.id}
            onClick={() => onContactClick?.(contact)}
            style={{
              display: 'flex',
              gap: 10,
              padding: '10px 12px',
              borderBottom: '1px solid var(--border, #d4cfc9)',
              cursor: 'pointer',
              alignItems: 'center',
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--accent, #b5936a)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, flexShrink: 0,
            }}>
              {initials(contact.name)}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact.name}</div>
              {contact.phone && (
                <div style={{ fontSize: 11, color: 'var(--muted-foreground, #6b6560)' }}>{contact.phone.number}</div>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 16, color: 'var(--muted-foreground, #6b6560)', fontSize: 13 }}>Sin resultados</div>
        )}
      </div>
    </div>
  )
}
