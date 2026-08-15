import { useEffect } from 'react'
import { useContacts } from '@muralink/module-contacts/web'
import { useExpenses } from '../expensesStore.ts'
import { balanceOf, formatMoney } from '../../../types.ts'

const ME = 'Yo'
const POSITIVE = '#16a34a'
const NEGATIVE = '#dc2626'

// The single-account grid cell: the ledger of ONE contact, bound via
// cell.props.accountId. With no binding it shows a contact picker so the user
// chooses which relationship this widget tracks (persisted through onPick).
export function LedgerCard({
  accountId,
  onPick,
}: {
  accountId?: string
  onPick?: (contactId: string) => void
}) {
  const contacts = useContacts((s) => s.contacts)
  const contactsLoaded = useContacts((s) => s.loaded)
  const loadContacts = useContacts((s) => s.loadAll)
  const entries = useExpenses((s) => s.entries)
  const loaded = useExpenses((s) => s.loaded)
  const loadAll = useExpenses((s) => s.loadAll)

  useEffect(() => { if (!contactsLoaded) void loadContacts() }, [contactsLoaded, loadContacts])
  useEffect(() => { if (!loaded) void loadAll() }, [loaded, loadAll])

  if (!accountId) {
    return (
      <div style={{ height: '100%', overflow: 'auto', padding: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--fg-faint)', padding: '4px 6px 8px' }}>Elige una cuenta</div>
        {contacts.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick?.(c.id)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 8px', border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--fg)', cursor: 'pointer', fontSize: 13 }}
          >
            {c.name}
          </button>
        ))}
        {contacts.length === 0 && <div style={{ padding: 12, fontSize: 11, color: 'var(--fg-faint)' }}>No hay contactos.</div>}
      </div>
    )
  }

  const contact = contacts.find((c) => c.id === accountId)
  const mine = entries.filter((e) => e.accountId === accountId)
  const balance = balanceOf(mine)
  const recent = mine.slice(-6).reverse()
  const balColor = balance.amount > 0 ? POSITIVE : balance.amount < 0 ? NEGATIVE : 'var(--fg-faint)'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {contact?.name ?? 'Cuenta'}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: balColor, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(balance)}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {recent.length === 0 ? (
          <div style={{ padding: 16, fontSize: 11, color: 'var(--fg-faint)', textAlign: 'center' }}>Sin movimientos</div>
        ) : recent.map((e) => (
          <div key={e.id} style={{ display: 'flex', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
            <span style={{ flex: 1, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span style={{ color: 'var(--fg-faint)' }}>{e.providedBy === 'me' ? ME : contact?.name ?? ''}: </span>
              {e.description}
            </span>
            <span style={{ color: e.amount.amount >= 0 ? POSITIVE : NEGATIVE, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatMoney(e.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
