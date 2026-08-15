export { NotesCard } from './views/NotesCard.tsx'
export { PostitCard } from './views/PostitCard.tsx'
export { NotesApp } from './views/NotesApp.tsx'
export { useNotes } from './notesStore.ts'
// Re-exported from the shared @muralink/editor package so existing consumers
// of `@muralink/module-notes/web` keep working after the extraction.
export { MarkdownEditor } from '@muralink/editor'
