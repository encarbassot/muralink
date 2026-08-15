// MVP room for one project: upload/preview the original, drop timestamped
// notes ("layovers") that appear on every connected device in real time, and
// see where every other device's playhead currently sits. This is the web
// leg of the cross-device MVP (laptop browser + orchester + phone) — the
// phone leg is vid-media-lab's SyncManager talking the same REST+WS contract.
//
// Deliberately NOT here: actual video frames never cross devices. Every
// device previews the SAME original (cloned once via /api/storage) with the
// SAME op-log folded on top, so previews match without streaming pixels.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { randomUUID } from 'crypto'
import { VideoEditorClient } from './client.ts'
import type { YOp, YProject } from '../../types.ts'

interface Note {
  id: string
  timelineMs: number
  text: string
  author?: string
}

interface RemotePlayhead {
  actorId: string
  ms: number
  updatedAt: number
}

export interface ProjectRoomEnv {
  apiBaseUrl: string
  apiToken: string
  /** Stable per-device id — persist across reloads (localStorage is fine for the web leg). */
  actorId: string
  userLabel?: string
}

function loadOrCreateActorId(): string {
  const key = 'video-editor:actorId'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(key, id)
  return id
}

export function ProjectRoom({ projectId, env }: { projectId: string; env: Omit<ProjectRoomEnv, 'actorId'> }) {
  const actorId = useMemo(loadOrCreateActorId, [])
  const client = useMemo(
    () => new VideoEditorClient({ apiBaseUrl: env.apiBaseUrl, apiToken: env.apiToken, actorId }),
    [env.apiBaseUrl, env.apiToken, actorId],
  )

  const [project, setProject] = useState<YProject | undefined>()
  const [notes, setNotes] = useState<Note[]>([])
  const [playheads, setPlayheads] = useState<Record<string, RemotePlayhead>>({})
  const [videoSrc, setVideoSrc] = useState<string | undefined>()
  const [durationMs, setDurationMs] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  const applyOp = useCallback((op: YOp) => {
    if (op.type === 'layover.note.add') {
      const p = op.payload as Note
      setNotes((prev) => (prev.some((n) => n.id === p.id) ? prev : [...prev, p].sort((a, b) => a.timelineMs - b.timelineMs)))
    } else if (op.type === 'playhead.set') {
      const p = op.payload as { ms: number }
      if (op.stamp.actorId === actorId) return // don't show our own marker
      setPlayheads((prev) => ({ ...prev, [op.stamp.actorId]: { actorId: op.stamp.actorId, ms: p.ms, updatedAt: Date.now() } }))
    } else if (op.type === 'asset.register') {
      const p = op.payload as { asset?: { storagePath: string; durationMs: number } }
      if (p.asset) {
        setDurationMs(p.asset.durationMs)
        setVideoSrc(`${env.apiBaseUrl}/api/storage/serve?path=${encodeURIComponent(p.asset.storagePath)}&token=${encodeURIComponent(env.apiToken)}`)
      }
    }
  }, [actorId, env.apiBaseUrl, env.apiToken])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const p = await client.getProject(projectId)
      if (cancelled) return
      setProject(p)
      const ops = await client.getOps(projectId, 0)
      if (cancelled) return
      for (const op of ops) applyOp(op)
    })()
    const unsubscribe = client.subscribe(projectId, applyOp)
    return () => { cancelled = true; unsubscribe() }
  }, [client, projectId, applyOp])

  // Stale remote playheads fade after 15s of silence (device likely closed the room).
  useEffect(() => {
    const t = setInterval(() => {
      setPlayheads((prev) => {
        const cutoff = Date.now() - 15_000
        const next = Object.fromEntries(Object.entries(prev).filter(([, v]) => v.updatedAt > cutoff))
        return Object.keys(next).length === Object.keys(prev).length ? prev : next
      })
    }, 5000)
    return () => clearInterval(t)
  }, [])

  async function handleUpload(file: File) {
    const dir = `video-editor/${projectId}/media`
    await fetch(`${env.apiBaseUrl}/api/storage/mkdir`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dir }),
    })
    const storagePath = `${dir}/${file.name}`
    await fetch(`${env.apiBaseUrl}/api/storage/upload?dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.apiToken}`, 'Content-Type': 'application/octet-stream' },
      body: file,
    })

    const durationMsLocal = await new Promise<number>((resolve) => {
      const probe = document.createElement('video')
      probe.preload = 'metadata'
      probe.onloadedmetadata = () => resolve(Math.round(probe.duration * 1000))
      probe.src = URL.createObjectURL(file)
    })

    const op: YOp = {
      id: randomUUID(),
      projectId,
      stamp: client.nextStamp(),
      type: 'asset.register',
      payload: { asset: { id: randomUUID(), projectId, storagePath, durationMs: durationMsLocal } },
      createdAt: new Date().toISOString(),
    }
    await client.appendOps(projectId, [op])
    applyOp(op) // optimistic — our own WS echo is suppressed server-side
  }

  async function addNoteHere() {
    const ms = Math.round((videoRef.current?.currentTime ?? 0) * 1000)
    const text = window.prompt('Nota en este punto del timeline:')
    if (!text) return
    const op: YOp = {
      id: randomUUID(),
      projectId,
      stamp: client.nextStamp(),
      type: 'layover.note.add',
      payload: { id: randomUUID(), timelineMs: ms, text, author: env.userLabel ?? actorId.slice(0, 6) } satisfies Note,
      createdAt: new Date().toISOString(),
    }
    await client.appendOps(projectId, [op])
    applyOp(op)
  }

  const throttleRef = useRef(0)
  function onTimeUpdate() {
    const now = Date.now()
    if (now - throttleRef.current < 800) return // don't flood the op-log with playhead spam
    throttleRef.current = now
    const ms = Math.round((videoRef.current?.currentTime ?? 0) * 1000)
    void client.appendOps(projectId, [{
      id: randomUUID(),
      projectId,
      stamp: client.nextStamp(),
      type: 'playhead.set',
      payload: { ms },
      createdAt: new Date().toISOString(),
    }])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, color: 'var(--fg)' }}>
      <h2 style={{ margin: 0 }}>{project?.name ?? 'Cargando…'}</h2>

      {!videoSrc && (
        <label style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 24, textAlign: 'center', cursor: 'pointer' }}>
          Subir original
          <input type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && void handleUpload(e.target.files[0])} />
        </label>
      )}

      {videoSrc && (
        <>
          <video ref={videoRef} src={videoSrc} controls onTimeUpdate={onTimeUpdate} style={{ width: '100%', borderRadius: 8, background: '#000' }} />

          <div style={{ position: 'relative', height: 24, background: 'var(--bg-elevated)', borderRadius: 4 }}>
            {notes.map((n) => (
              <div
                key={n.id}
                title={`${n.author ?? '?'}: ${n.text}`}
                onClick={() => { if (videoRef.current) videoRef.current.currentTime = n.timelineMs / 1000 }}
                style={{
                  position: 'absolute', left: `${durationMs ? (n.timelineMs / durationMs) * 100 : 0}%`,
                  top: 2, width: 8, height: 8, borderRadius: 4, background: 'var(--accent)', cursor: 'pointer',
                }}
              />
            ))}
            {Object.values(playheads).map((p) => (
              <div
                key={p.actorId}
                title={`Reproduciendo en ${p.actorId.slice(0, 6)}`}
                style={{
                  position: 'absolute', left: `${durationMs ? (p.ms / durationMs) * 100 : 0}%`,
                  top: 12, width: 2, height: 10, background: '#f59e0b',
                }}
              />
            ))}
          </div>

          <button onClick={() => void addNoteHere()} style={{ alignSelf: 'flex-start' }}>+ Nota aquí</button>
        </>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {notes.map((n) => (
          <li key={n.id} style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
            {(n.timelineMs / 1000).toFixed(1)}s — <strong>{n.author}</strong>: {n.text}
          </li>
        ))}
      </ul>
    </div>
  )
}
