import type { GridLayoutConfig } from '@muralink/types'

export const WEB_LAYOUT_ID = 'web-dashboard'

// What a fresh orchester looks like the first time someone opens it.
//
// This used to be an empty grid, which meant every new instance greeted its
// owner with a blank page and no clue what the product does. It is now a
// deliberate first screen: the calendar (the module every instance has
// preinstalled) and the murales card that holds the welcome note.
//
// The calendar cell is `pinned`, which is what puts it in the dock —
// pinnedDockItems.tsx projects the dock from the pinned cells of the current
// layout, so dock presence and grid presence are one decision, not two.
//
// Only a seed: this is written once, on first load, and the user owns it from
// then on. Editing this file never touches an instance that already has a
// layout. See seedWelcome.ts for the mural itself.
export const defaultLayout: GridLayoutConfig = {
  layoutId: WEB_LAYOUT_ID,
  platform: 'web',
  columns: 6,
  cellSize: 160,
  gap: 12,
  cells: [
    {
      id: 'seed-calendar',
      moduleId: 'calendar',
      // The cell view is a vertical agenda — 2x3 is the descriptor's own
      // default, tall and narrow so it never sprawls.
      viewSpecId: 'calendar/2x3',
      size: '2x3',
      position: { col: 0, row: 0 },
      pinned: true,
    },
    {
      id: 'seed-murales',
      moduleId: 'murales',
      viewSpecId: 'murales/2x2',
      size: '2x2',
      position: { col: 2, row: 0 },
    },
  ],
}
