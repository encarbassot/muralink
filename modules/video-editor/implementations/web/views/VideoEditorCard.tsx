// Bento card entry point (per manifest.ts views[0]). Lists projects; opening
// one is left to the host page/dock to route to <ProjectRoom>, same as notes
// leaves opening a note to `onExpand`. NOTE: unlike notes, this card needs
// apiBaseUrl/apiToken to talk to the server — notes gets away with a
// zustand+Space abstraction that hides that; video-editor doesn't have an
// equivalent yet, so `env` is threaded explicitly for now. Wiring this into
// the real AppEnv/dock plumbing is follow-up work once the MVP room is
// validated end to end.

import { useEffect, useState } from 'react'
import type { GridSize } from '@muralink/types'
import { VideoEditorClient } from '../client.ts'
import type { YProject } from '../../../types.ts'

interface Props {
  size: GridSize
  env: { apiBaseUrl: string; apiToken: string; actorId: string }
  onOpen?: (projectId: string) => void
}

export function VideoEditorCard({ size, env, onOpen }: Props) {
  const [projects, setProjects] = useState<YProject[]>([])
  const rows = Number(size.split('x')[1])
  const max = rows >= 3 ? 6 : rows === 2 ? 4 : 2

  useEffect(() => {
    const client = new VideoEditorClient(env)
    void client.listProjects().then(setProjects)
  }, [env])

  return (
    <div
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-elevated)', borderRadius: 12, padding: 12, boxSizing: 'border-box', overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>🎬</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', flex: 1 }}>Video editor</span>
        <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{projects.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
        {projects.slice(0, max).map((p) => (
          <div
            key={p.id}
            onClick={() => onOpen?.(p.id)}
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg)', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {p.name}
          </div>
        ))}
      </div>
    </div>
  )
}
