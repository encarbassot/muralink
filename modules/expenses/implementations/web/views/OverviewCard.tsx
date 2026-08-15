import { useEffect, useMemo } from 'react'
import { useContacts } from '@muralink/module-contacts/web'
import { useExpenses } from '../expensesStore.ts'
import { euros, formatMoney } from '../../../types.ts'

const POSITIVE = '#16a34a'
const NEGATIVE = '#dc2626'

// The overview grid cell: every contact you have movements with + their
// balance. Clicking a row opens that account in the full app (onOpenAccount).
export function OverviewCard({ onOpenAccount }: { onOpenAccount?: (contactId: string) => void }) {
  const contacts = useContacts((s) => s.contacts)
  const contactsLoaded = useContacts((s) => s.loaded)
  const loadContacts = useContacts((s) => s.loadAll)
  const entries = useExpenses((s) => s.entries)
  const loaded = useExpenses((s) => s.loaded)
  const loadAll = useExpenses((s) => s.loadAll)

  useEffect(() => { if (!contactsLoaded) void loadContacts() }, [contactsLoaded, loadContacts])
  useEffect(() => { if (!loaded) void loadAll() }, [loaded, loadAll])

  const rows = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) map.set(e.accountId, (map.get(e.accountId) ?? 0) + e.amount.amount)
    return [...map.entries()]
      .map(([id, minor]) => ({ id, name: contacts.find((c) => c.id === id)?.name ?? '—', minor }))
      .sort((a, b) => Math.abs(b.minor) - Math.abs(a.minor))
  }, [entries, contacts])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Cuentas</div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 16, fontSize: 11, color: 'var(--fg-faint)', textAlign: 'center' }}>Sin movimientos</div>
        ) : rows.map((r) => {
          const color = r.minor > 0 ? POSITIVE : r.minor < 0 ? NEGATIVE : 'var(--fg-faint)'
          return (
            <div
              key={r.id}
              onClick={() => onOpenAccount?.(r.id)}
              style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, cursor: onOpenAccount ? 'pointer' : 'default' }}
            >
              <span style={{ flex: 1, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              <span style={{ color, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatMoney(euros(r.minor / 100))}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
