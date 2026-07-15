import { useEffect, useState } from 'react'
import { getSpace } from '@muralink/spaces'
import type { YContact } from '../../../types.ts'
import type { ContactsAdapter } from '../../../adapter.ts'
import { useContacts } from '../contactsStore.ts'

// Standalone, local-first contacts app: master list + editable detail pane.
// Backed entirely by IndexedDB (via useContacts) so it works offline with no
// backend. Mirrors NotesApp's list/detail layout and design tokens.

interface Props {
  /** Pre-select a contact on open. */
  initialContactId?: string
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

export function ContactsApp({ initialContactId }: Props) {
  const contacts = useContacts((s) => s.contacts)
  const loaded = useContacts((s) => s.loaded)
  const loadAll = useContacts((s) => s.loadAll)
  const create = useContacts((s) => s.create)
  const update = useContacts((s) => s.update)
  const remove = useContacts((s) => s.remove)

  const [activeId, setActiveId] = useState<string | undefined>(initialContactId)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!loaded) void loadAll()
  }, [loaded, loadAll])

  useEffect(() => {
    if (!loaded) return
    if (activeId && contacts.some((c) => c.id === activeId)) return
    setActiveId(contacts[0]?.id)
  }, [loaded, contacts, activeId])

  const active = contacts.find((c) => c.id === activeId)

  // Contacts coming from an external platform (adapter space) are read-only
  // here — the platform stays the source of truth; offer a deep link instead.
  const activeSpace = active ? getSpace<YContact>('contacts', active.spaceId ?? 'local') : undefined
  const activeReadonly = !!activeSpace?.readonly
  const crmUrl =
    active && activeSpace && 'externalUrl' in activeSpace
      ? (activeSpace as ContactsAdapter).externalUrl?.(active)
      : undefined

  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.address.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.number.includes(search),
  )

  async function handleNew() {
    const c = await create({ name: 'Nuevo contacto' })
    setActiveId(c.id)
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--bg)' }}>
      {/* Sidebar list */}
      <div style={{ width: 240, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', flex: 1 }}>Contactos</span>
          <button
            onClick={() => void handleNew()}
            title="Nuevo contacto"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--fg-dim)', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 14 }}
          >
            +
          </button>
        </div>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar contacto…"
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, outline: 'none', background: 'var(--bg-elevated)', color: 'var(--fg)', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filtered.map((c) => (
            <div
              key={c.id}
              onClick={() => setActiveId(c.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderBottom: '1px solid var(--border)',
                borderLeft: `2px solid ${c.id === activeId ? 'var(--accent)' : 'transparent'}`,
                background: c.id === activeId ? 'var(--bg-elevated)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', flexShrink: 0 }}>
                {initials(c.name) || '?'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div style={{ fontSize: 10, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.email?.address ?? c.phone?.number ?? ''}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 16, fontSize: 11, color: 'var(--fg-faint)', textAlign: 'center' }}>
              {contacts.length === 0 ? 'Sin contactos' : 'Sin resultados'}
            </div>
          )}
        </div>
      </div>

      {/* Detail pane */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        {active ? (
          <ContactDetail
            key={active.id}
            contact={active}
            readonly={activeReadonly}
            sourceLabel={activeReadonly ? activeSpace?.label : undefined}
            crmUrl={crmUrl}
            onChange={(patch) => void update(active.id, patch)}
            onDelete={() => void remove(active.id)}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--fg-faint)' }}>
            <span style={{ fontSize: 32, opacity: 0.4 }}>👤</span>
            <button
              onClick={() => void handleNew()}
              style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--fg-dim)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}
            >
              Crear primer contacto
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, placeholder, onChange, readonly }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void; readonly?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-faint)' }}>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        disabled={readonly}
        onChange={(e) => onChange(e.target.value)}
        style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13, outline: 'none', background: 'var(--bg-elevated)', color: 'var(--fg)', opacity: readonly ? 0.7 : 1 }}
      />
    </label>
  )
}

function ContactDetail({
  contact,
  readonly,
  sourceLabel,
  crmUrl,
  onChange,
  onDelete,
}: {
  contact: YContact
  readonly?: boolean
  sourceLabel?: string
  crmUrl?: string
  onChange: (patch: Partial<YContact>) => void
  onDelete: () => void
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <input
          value={contact.name}
          disabled={readonly}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nombre"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg)', fontSize: 15, fontWeight: 600 }}
        />
        {readonly && (
          <span
            title={`Solo lectura — se gestiona en ${sourceLabel ?? 'la plataforma de origen'}`}
            style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-faint)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}
          >
            {sourceLabel ?? 'Solo lectura'}
          </span>
        )}
        {crmUrl && (
          <a
            href={crmUrl}
            target="_blank"
            rel="noreferrer"
            title="Abrir en la plataforma de origen"
            style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}
          >
            Abrir ↗
          </a>
        )}
        {!readonly && (
          <button
            onClick={onDelete}
            title="Eliminar contacto"
            style={{ border: '1px solid color-mix(in srgb, #ef4444 30%, transparent)', background: 'color-mix(in srgb, #ef4444 8%, transparent)', color: '#f87171', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 12 }}
          >
            ✕
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460 }}>
        <Field
          label="Email"
          value={contact.email?.address ?? ''}
          placeholder="nombre@dominio.com"
          readonly={readonly}
          onChange={(v) => onChange({ email: v ? { address: v } : undefined })}
        />
        <Field
          label="Teléfono"
          value={contact.phone?.number ?? ''}
          placeholder="+34 600 000 000"
          readonly={readonly}
          onChange={(v) => onChange({ phone: v ? { number: v, countryCode: contact.phone?.countryCode ?? '' } : undefined })}
        />
        {contact.company && <Field label="Empresa" value={contact.company} readonly onChange={() => {}} />}
        {contact.custom && Object.keys(contact.custom).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(contact.custom).map(([k, v]) => (
              <Field key={k} label={k} value={String(v)} readonly onChange={() => {}} />
            ))}
          </div>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-faint)' }}>Notas</span>
          <textarea
            value={contact.notes ?? ''}
            placeholder="Notas internas…"
            disabled={readonly}
            onChange={(e) => onChange({ notes: e.target.value })}
            rows={5}
            style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13, outline: 'none', background: 'var(--bg-elevated)', color: 'var(--fg)', resize: 'vertical', fontFamily: 'inherit', opacity: readonly ? 0.7 : 1 }}
          />
        </label>
      </div>
    </>
  )
}
