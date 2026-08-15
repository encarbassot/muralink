# expenses — two-party ledger (Splitwise style)

A running-balance ledger between the local user ("Yo") and **one contact**. Each
account is `accountId === contactId`, so the module **depends on `contacts`**.
Single-user core: sharing the same ledger with the other party is a later
tunnel/space concern, not implemented here.

- **Depends on:** `contacts`, `@muralink/types` (`YMoney`)
- **Platforms:** web, local-server

## Model

- `YExpenseEntry` — one movement. `amount` is **signed** from my perspective
  (`+` = the counterparty owes me), stored as integer minor units (EUR, 2 dec).
- Balance = signed sum of an account's movements (`balanceOf`, derived, never stored).
- **Saldar cuentas** = a counter-movement of `-balance` → leaves the account at 0.

## Surfaces

- **Dock app** `ExpensesApp` (`💰 Cuentas`) — master-detail: contacts left,
  ledger table + add-movement form + "Saldar cuentas" right.
- **Grid cells** (`./cell`): `expensesLedgerCell` (one account, bound via
  `cell.props.accountId`) and `expensesCell` (balance overview).
- **Server** (`./server`): sqlite table `expense_entries` +
  `createExpensesRouter(db)` mounted at `/api/expenses`.

Local-first: the web store persists to IndexedDB by default; the server router
exists for orchester sync when a host registers an http space.
