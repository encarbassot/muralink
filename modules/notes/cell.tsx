// The notes module as a bento cell. Registered by platforms into their
// CellRegistry. The card click opens the full NotesApp as a modal (web).

import type { CellModule } from '@muralink/shell'
import { NotesCard } from './implementations/web/index.ts'

export const notesCell: CellModule = {
  descriptor: {
    moduleId: 'notes',
    label: 'Notes',
    icon: '📝',
    description: 'Markdown notes — VSCode + Notion style editor',
    defaultSize: '2x2',
    availableSizes: ['1x2', '2x1', '2x2', '2x3', '3x2', '3x3'],
    // 'text' is the simple note view shown in the picker; the full notes app is
    // still registered (renders existing 'notes' cells) but hidden from add.
    hiddenFromPicker: true,
  },
  render: (cell, ctx) => (
    <NotesCard size={cell.size} onExpand={(noteId) => ctx.openModal?.('notes', noteId)} />
  ),
}
