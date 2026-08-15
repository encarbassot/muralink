// The video-editor module as a bento cell, mirroring notes/cell.tsx.
//
// CellContext (packages/shell/src/cellRegistry.tsx) has no apiBaseUrl/token/
// deviceId slot today — nothing in the shell threads AppEnv down to a cell.
// Notes sidesteps this by going through a Space abstraction instead of
// talking to the API directly. Until video-editor gets the same treatment
// (or CellContext grows an env field), this cell falls back to same-origin
// defaults, matching packages/app/src/env.ts's defaultEnv. Fine for a single
// web instance; revisit before electron/tunnel need this cell.
import { useMemo } from 'react'
import type { CellModule } from '@muralink/shell'
import { VideoEditorCard } from './implementations/web/index.ts'

function loadOrCreateActorId(): string {
  const key = 'video-editor:actorId'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(key, id)
  return id
}

function VideoEditorCellBody({ size, onOpen }: { size: import('@muralink/types').GridSize; onOpen: (projectId: string) => void }) {
  const actorId = useMemo(loadOrCreateActorId, [])
  return (
    <VideoEditorCard
      size={size}
      env={{ apiBaseUrl: '', apiToken: 'dev-token', actorId }}
      onOpen={onOpen}
    />
  )
}

export const videoEditorCell: CellModule = {
  descriptor: {
    moduleId: 'video-editor',
    label: 'Video editor',
    icon: '🎬',
    description: 'Layered video editing, synced across devices as an op-log — originals stay put.',
    defaultSize: '2x2',
    availableSizes: ['2x2', '2x3', '3x2', '3x3'],
  },
  render: (cell, ctx) => (
    <VideoEditorCellBody size={cell.size} onOpen={(projectId) => ctx.openModal?.('video-editor', projectId)} />
  ),
}
