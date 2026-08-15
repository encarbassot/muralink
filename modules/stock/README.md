# @muralink/module-stock

Inventory: products, quantities, locations, and what things cost. This is the
module behind the "Inventario" widget.

## What lives here

- **[manifest.ts](manifest.ts)** — `YStockItem`.
- **[implementations/web/views/StockList.2x2.tsx](implementations/web/views/StockList.2x2.tsx)** —
  the widget.
- **[implementations/web/views/InventoryApp.tsx](implementations/web/views/InventoryApp.tsx)** —
  the full view.
- **[implementations/server/](implementations/server/)** — persistence and the
  `/api/stock` routes.

## Rules

- **Prices are `YMoney`** — amount, currency and precision together. Never a
  bare float.
- **Leaf module.** It uses `@muralink/calc` for computed values and
  `@muralink/payments` for the charging seam; neither is a module dependency.
