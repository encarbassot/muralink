// Two bento cells for the expenses ledger. Both are local-first: they read the
// same spaces-backed store as the dock app, so they work offline and stay in
// sync with it. The single-account cell stores only its bound contact id in
// cell.props (like the notes "Nota" widget stores a noteId).

import type { CellModule } from '@muralink/shell'
import { LedgerCard, OverviewCard } from './implementations/web/index.ts'

// The account-ledger cell: bound to one contact via props.accountId. Expanding
// opens the full app already focused on that account.
export const expensesLedgerCell: CellModule = {
  descriptor: {
    moduleId: 'expenses-ledger',
    label: 'Cuenta',
    icon: '💰',
    description: 'Libro de una cuenta A↔B con saldo acumulado',
    defaultSize: '2x3',
    availableSizes: ['2x2', '2x3', '3x2', '3x3'],
  },
  render: (cell, ctx) => {
    const accountId = cell.props?.['accountId'] as string | undefined
    return (
      <LedgerCard
        accountId={accountId}
        onPick={(id) => ctx.updateCell?.(cell.id, { props: { ...cell.props, accountId: id } })}
      />
    )
  },
  methods: [
    { id: 'open', label: 'Abrir cuenta', icon: '💰', isDefault: true, run: (cell, ctx) => ctx.openModal?.('expenses', cell.props?.['accountId'] as string | undefined) },
  ],
}

// The overview cell: all contacts with a balance. Clicking a row (or expanding)
// opens the full app.
export const expensesCell: CellModule = {
  descriptor: {
    moduleId: 'expenses',
    label: 'Cuentas',
    icon: '💰',
    description: 'Resumen de saldos por contacto',
    defaultSize: '2x2',
    availableSizes: ['2x2', '2x3', '3x2'],
  },
  render: (_cell, ctx) => <OverviewCard onOpenAccount={(id) => ctx.openModal?.('expenses', id)} />,
  methods: [
    { id: 'open', label: 'Abrir cuentas', icon: '💰', isDefault: true, run: (_cell, ctx) => ctx.openModal?.('expenses') },
  ],
}
