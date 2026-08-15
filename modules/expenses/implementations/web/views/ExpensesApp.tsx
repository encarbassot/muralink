import { useEffect, useMemo, useState } from 'react'
import { Button } from '@muralink/ui'
import { useContacts } from '@muralink/module-contacts/web'
import type { YContact } from '@muralink/module-contacts/types'
import { useExpenses, type NewMovement } from '../expensesStore.ts'
import type { ProvidedBy } from '../../../types.ts'
import { balanceOf, formatMoney, euros } from '../../../types.ts'

// The local user, party "A" of every A↔B ledger. Fixed for now (single-user
// core); a configurable name is a later instance-config concern.
const ME = 'Yo'

const POSITIVE = '#16a34a'
const NEGATIVE = '#dc2626'

// A signed money value coloured green in my favour / red against me / muted at 0.
function Money({ money, bold }: { money: ReturnType<typeof balanceOf>; bold?: boolean }) {
  const n = money.amount
  const color = n > 0 ? POSITIVE : n < 0 ? NEGATIVE : 'var(--fg-faint)'
  return (
    <span style={{ color, fontWeight: bold ? 700 : 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      {formatMoney(money)}
    </span>
  )
}

interface Props {
  /** Pre-select an account (contact id) on open. */
  initialAccountId?: string
}

export function ExpensesApp({ initialAccountId }: Props) {
  const contacts = useContacts((s) => s.contacts)
  const contactsLoaded = useContacts((s) => s.loaded)
  const loadContacts = useContacts((s) => s.loadAll)

  const entries = useExpenses((s) => s.entries)
  const loaded = useExpenses((s) => s.loaded)
  const loadAll = useExpenses((s) => s.loadAll)

  const [activeId, setActiveId] = useState<string | undefined>(initialAccountId)

  useEffect(() => { if (!contactsLoaded) void loadContacts() }, [contactsLoaded, loadContacts])
  useEffect(() => { if (!loaded) void loadAll() }, [loaded, loadAll])

  // Balance per contact, recomputed whenever movements change.
  const balances = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) map.set(e.accountId, (map.get(e.accountId) ?? 0) + e.amount.amount)
    return map
  }, [entries])

  // List contacts with movements first (by |balance|), then the rest by name —
  // so active ledgers are on top but you can still open a fresh account.
  const ordered = useMemo(() => {
    return [...contacts].sort((a, b) => {
      const ba = balances.has(a.id) ? 1 : 0
      const bb = balances.has(b.id) ? 1 : 0
      if (ba !== bb) return bb - ba
      return a.name.localeCompare(b.name)
    })
  }, [contacts, balances])

  const active = contacts.find((c) => c.id === activeId)

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--bg)' }}>
      {/* Sidebar: the accounts (one per contact) */}
      <div style={{ width: 240, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          Cuentas
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {ordered.map((c) => {
            const bal = euros((balances.get(c.id) ?? 0) / 100)
            return (
              <div
                key={c.id}
                onClick={() => setActiveId(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: `2px solid ${c.id === activeId ? 'var(--accent)' : 'transparent'}`,
                  background: c.id === activeId ? 'var(--bg-elevated)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.name}
                </span>
                {balances.has(c.id) && <span style={{ fontSize: 12 }}><Money money={bal} /></span>}
              </div>
            )
          })}
          {ordered.length === 0 && (
            <div style={{ padding: 16, fontSize: 11, color: 'var(--fg-faint)', textAlign: 'center' }}>
              No hay contactos todavía
            </div>
          )}
        </div>
      </div>

      {/* Detail: the selected account's ledger */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        {active ? (
          <AccountLedger key={active.id} contact={active} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--fg-faint)' }}>
            <span style={{ fontSize: 32, opacity: 0.4 }}>💰</span>
            <span style={{ fontSize: 12 }}>Selecciona una cuenta</span>
          </div>
        )}
      </div>
    </div>
  )
}

// One account = the ledger between ME and one contact.
function AccountLedger({ contact }: { contact: YContact }) {
  const entriesFor = useExpenses((s) => s.entries.filter((e) => e.accountId === contact.id))
  const settle = useExpenses((s) => s.settle)
  const remove = useExpenses((s) => s.remove)

  const balance = balanceOf(entriesFor)

  // Attach the running balance (cumulative sum, oldest → newest) to each row.
  const rows = useMemo(() => {
    let acc = 0
    return entriesFor.map((e) => {
      acc += e.amount.amount
      return { entry: e, running: { amount: acc, currency: balance.currency, precision: balance.precision } }
    })
  }, [entriesFor, balance.currency, balance.precision])

  return (
    <>
      {/* Header: name + total + settle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact.name}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
            {balance.amount > 0 ? `${contact.name} me debe` : balance.amount < 0 ? `Debo a ${contact.name}` : 'En paz'}
          </div>
        </div>
        <div style={{ fontSize: 22 }}><Money money={balance} bold /></div>
        <Button
          variant="secondary"
          size="sm"
          disabled={balance.amount === 0}
          onClick={() => void settle(contact.id, new Date().toLocaleDateString('es-ES'))}
          title="Crea un movimiento que deja el saldo a cero"
        >
          Saldar cuentas
        </Button>
      </div>

      {/* Ledger table */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 24, fontSize: 12, color: 'var(--fg-faint)', textAlign: 'center' }}>Sin movimientos</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: 'var(--bg)', color: 'var(--fg-faint)', textAlign: 'left' }}>
                <Th>Quién</Th>
                <Th>Fecha</Th>
                <Th>Descripción</Th>
                <Th right>Valor</Th>
                <Th right>Horas</Th>
                <Th right>Km</Th>
                <Th right>Saldo</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, running }) => (
                <tr key={entry.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <Td>{entry.providedBy === 'me' ? ME : contact.name}</Td>
                  <Td dim>{entry.dateText || '—'}</Td>
                  <Td>
                    {entry.url ? (
                      <a href={entry.url.raw} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{entry.description}</a>
                    ) : entry.description}
                    {entry.notes ? <span style={{ color: 'var(--fg-faint)' }}> · {entry.notes}</span> : null}
                  </Td>
                  <Td right><Money money={entry.amount} /></Td>
                  <Td right dim>{entry.hours ?? ''}</Td>
                  <Td right dim>{entry.km ?? ''}</Td>
                  <Td right><Money money={running} /></Td>
                  <Td>
                    <button
                      onClick={() => void remove(entry.id)}
                      title="Eliminar movimiento"
                      style={{ border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 12 }}
                    >
                      ✕
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <MovementForm accountId={contact.id} counterpartyName={contact.name} />
    </>
  )
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap' }}>{children}</th>
}

function Td({ children, right, dim }: { children?: React.ReactNode; right?: boolean; dim?: boolean }) {
  return (
    <td style={{ padding: '7px 10px', textAlign: right ? 'right' : 'left', color: dim ? 'var(--fg-faint)' : 'var(--fg)', fontVariantNumeric: right ? 'tabular-nums' : undefined, verticalAlign: 'top' }}>
      {children}
    </td>
  )
}

// Add a movement. Collects a positive magnitude + who put it in; the store
// derives the signed amount. Optional hours/km/notes/url mirror the source sheet.
function MovementForm({ accountId, counterpartyName }: { accountId: string; counterpartyName: string }) {
  const add = useExpenses((s) => s.add)
  const [providedBy, setProvidedBy] = useState<ProvidedBy>('me')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [dateText, setDateText] = useState('')
  const [hours, setHours] = useState('')
  const [km, setKm] = useState('')
  const [notes, setNotes] = useState('')
  const [more, setMore] = useState(false)

  const valid = description.trim().length > 0 && amount.trim() !== '' && !Number.isNaN(Number(amount.replace(',', '.')))

  async function submit() {
    if (!valid) return
    const m: NewMovement = {
      accountId,
      providedBy,
      amount: Math.abs(Number(amount.replace(',', '.'))),
      description: description.trim(),
      dateText: dateText.trim() || undefined,
      hours: hours.trim() ? Number(hours.replace(',', '.')) : undefined,
      km: km.trim() ? Number(km.replace(',', '.')) : undefined,
      notes: notes.trim() || undefined,
    }
    await add(m)
    setAmount(''); setDescription(''); setDateText(''); setHours(''); setKm(''); setNotes('')
  }

  const seg = (who: ProvidedBy, label: string) => (
    <button
      onClick={() => setProvidedBy(who)}
      style={{
        padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        border: '1px solid var(--border)',
        borderRadius: 6,
        background: providedBy === who ? 'var(--accent)' : 'var(--bg)',
        color: providedBy === who ? '#fff' : 'var(--fg-dim)',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-elevated)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {seg('me', `${ME} pone`)}
          {seg('them', `${counterpartyName} pone`)}
        </div>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Importe €" inputMode="decimal" style={inp(90)} onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} />
        <input value={dateText} onChange={(e) => setDateText(e.target.value)} placeholder="Fecha" style={inp(120)} />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" style={{ ...inp(0), flex: 1, minWidth: 120 }} onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} />
        <button onClick={() => setMore((v) => !v)} title="Más campos" style={{ border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg-dim)', borderRadius: 6, height: 30, width: 30, cursor: 'pointer' }}>{more ? '−' : '+'}</button>
        <Button size="sm" disabled={!valid} onClick={() => void submit()}>Añadir</Button>
      </div>
      {more && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Horas" inputMode="decimal" style={inp(80)} />
          <input value={km} onChange={(e) => setKm(e.target.value)} placeholder="Km" inputMode="decimal" style={inp(80)} />
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones" style={{ ...inp(0), flex: 1, minWidth: 120 }} />
        </div>
      )}
    </div>
  )
}

function inp(width: number): React.CSSProperties {
  return {
    width: width || undefined,
    height: 30,
    padding: '0 8px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--bg)',
    color: 'var(--fg)',
    fontSize: 12,
    outline: 'none',
  }
}
