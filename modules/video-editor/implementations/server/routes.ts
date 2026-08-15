// video-editor REST routes, mounted at /api/video-editor. This is the
// durable half of sync: every op lands here first (POST .../ops) and is
// fsync'd to SQLite before the response — that's the correctness boundary.
// The realtime hub is a pure latency optimization layered on top: after a
// durable append, we also publish() so already-connected devices see it
// immediately instead of waiting for their next poll/reconnect. A client
// that never opens a WebSocket at all still gets full sync by calling
// GET .../ops?since=<counter> on an interval or on resume — same as notes'
// http space, just topic-shaped.
//
// Attribution follows the notes module: X-Mural-User header, trusted (MVP).

import { Router } from 'express'
import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'
import type { RealtimeHub } from '@muralink/realtime'
import {
  getProjects,
  getProject,
  createProject,
  touchProject,
  getOps,
  appendOp,
  getAssets,
  registerAsset,
} from './queries.ts'
import type { YProject, YOp, YAsset } from '../../types.ts'

/** Topic naming is centralized here so the web/Android clients and this
 *  router can never drift apart on the convention. */
export function projectTopic(projectId: string): string {
  return `video-editor:${projectId}`
}

export function createVideoEditorRouter(db: Database, hub: RealtimeHub): Router {
  const router = Router()

  router.get('/projects', (_req, res) => {
    res.json(getProjects(db))
  })

  router.post('/projects', (req, res) => {
    const body = req.body as Partial<YProject>
    const now = new Date().toISOString()
    const project = createProject(db, {
      id: body.id ?? randomUUID(),
      name: body.name ?? 'Untitled project',
      createdBy: (req.header('x-mural-user') ?? body.createdBy) || undefined,
      createdAt: now,
      updatedAt: now,
    })
    res.status(201).json(project)
  })

  router.get('/projects/:id', (req, res) => {
    const project = getProject(db, req.params['id']!)
    if (!project) { res.status(404).json({ error: 'not found' }); return }
    res.json(project)
  })

  router.get('/projects/:id/ops', (req, res) => {
    const since = req.query['since'] ? Number(req.query['since']) : 0
    res.json({ ops: getOps(db, req.params['id']!, Number.isFinite(since) ? since : 0) })
  })

  // Batch append. Each op is idempotent (INSERT OR IGNORE on id), so a client
  // that retries a timed-out POST — or replays its local outbox after coming
  // back online — cannot double-apply. Publishes to the project's realtime
  // topic after the durable write succeeds, never before.
  router.post('/projects/:id/ops', (req, res) => {
    const projectId = req.params['id']!
    if (!getProject(db, projectId)) { res.status(404).json({ error: 'unknown project' }); return }

    const body = req.body as { ops?: Partial<YOp>[] }
    const incoming = body.ops ?? []
    if (incoming.length === 0) { res.status(400).json({ error: 'ops[] required' }); return }

    const now = new Date().toISOString()
    const accepted: YOp[] = []
    for (const raw of incoming) {
      if (!raw.id || !raw.stamp || !raw.type) continue // malformed op, skip rather than fail the whole batch
      const op: YOp = {
        id: raw.id,
        projectId,
        stamp: raw.stamp,
        type: raw.type,
        payload: raw.payload,
        createdAt: now,
      }
      appendOp(db, op)
      accepted.push(op)

      // Best-effort materialized index so GET /assets doesn't require a full
      // log replay. The op log stays the source of truth regardless.
      if (op.type === 'asset.register') {
        const payload = op.payload as { asset?: YAsset } | undefined
        if (payload?.asset) registerAsset(db, { ...payload.asset, projectId })
      }
    }

    if (accepted.length > 0) {
      touchProject(db, projectId, now)
      hub.publish(projectTopic(projectId), { ops: accepted })
    }

    res.status(201).json({ ops: accepted })
  })

  router.get('/projects/:id/assets', (req, res) => {
    res.json({ assets: getAssets(db, req.params['id']!) })
  })

  return router
}
