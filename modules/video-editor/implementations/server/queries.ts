import type { Database } from 'better-sqlite3'
import type { YProject, YOp, YAsset, LamportStamp } from '../../types.ts'

interface ProjectRow {
  id: string
  name: string
  created_by: string | null
  created_at: string
  updated_at: string
}

function rowToProject(row: ProjectRow): YProject {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getProjects(db: Database): YProject[] {
  const rows = db.prepare<[], ProjectRow>(`SELECT * FROM video_projects ORDER BY updated_at DESC`).all()
  return rows.map(rowToProject)
}

export function getProject(db: Database, id: string): YProject | undefined {
  const row = db.prepare<[string], ProjectRow>(`SELECT * FROM video_projects WHERE id = ?`).get(id)
  return row ? rowToProject(row) : undefined
}

// INSERT OR IGNORE (not plain INSERT): callers may pass a client-supplied id
// (Android reuses its local Project.id as the server id — see
// VideoEditorApi.ensureProject in vid-media-lab) and retry a create that
// already landed. Mirrors appendOp/registerAsset's idempotency.
export function createProject(db: Database, project: YProject): YProject {
  db.prepare(
    `INSERT OR IGNORE INTO video_projects (id, name, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(project.id, project.name, project.createdBy ?? null, project.createdAt, project.updatedAt)
  return getProject(db, project.id)!
}

export function touchProject(db: Database, id: string, updatedAt: string): void {
  db.prepare(`UPDATE video_projects SET updated_at = ? WHERE id = ?`).run(updatedAt, id)
}

interface OpRow {
  id: string
  project_id: string
  lamport_counter: number
  lamport_actor: string
  op_type: string
  payload: string
  created_at: string
}

function rowToOp(row: OpRow): YOp {
  return {
    id: row.id,
    projectId: row.project_id,
    stamp: { counter: row.lamport_counter, actorId: row.lamport_actor },
    type: row.op_type,
    payload: JSON.parse(row.payload) as unknown,
    createdAt: row.created_at,
  }
}

/**
 * Ops for a project, in causal replay order. `sinceCounter` lets a
 * reconnecting client fetch only what it's missing — it should pass the
 * highest counter it has already applied for *any* actor (a client-side
 * high-water-mark), then locally dedupe by op id since two actors can share
 * a counter value.
 */
export function getOps(db: Database, projectId: string, sinceCounter = 0): YOp[] {
  const rows = db
    .prepare<[string, number], OpRow>(
      `SELECT * FROM video_ops
       WHERE project_id = ? AND lamport_counter > ?
       ORDER BY lamport_counter ASC, lamport_actor ASC`,
    )
    .all(projectId, sinceCounter)
  return rows.map(rowToOp)
}

/** Idempotent: re-appending an op id that already exists is a no-op (safe retry). */
export function appendOp(db: Database, op: YOp): YOp {
  db.prepare(
    `INSERT OR IGNORE INTO video_ops
       (id, project_id, lamport_counter, lamport_actor, op_type, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    op.id,
    op.projectId,
    op.stamp.counter,
    op.stamp.actorId,
    op.type,
    JSON.stringify(op.payload),
    op.createdAt,
  )
  return op
}

export function highestStampSeen(db: Database, projectId: string): LamportStamp | undefined {
  const row = db
    .prepare<[string], { lamport_counter: number; lamport_actor: string }>(
      `SELECT lamport_counter, lamport_actor FROM video_ops
       WHERE project_id = ? ORDER BY lamport_counter DESC LIMIT 1`,
    )
    .get(projectId)
  return row ? { counter: row.lamport_counter, actorId: row.lamport_actor } : undefined
}

interface AssetRow {
  id: string
  project_id: string
  storage_path: string
  duration_ms: number
  width: number | null
  height: number | null
  sha256: string | null
}

function rowToAsset(row: AssetRow): YAsset {
  return {
    id: row.id,
    projectId: row.project_id,
    storagePath: row.storage_path,
    durationMs: row.duration_ms,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    sha256: row.sha256 ?? undefined,
  }
}

export function getAssets(db: Database, projectId: string): YAsset[] {
  const rows = db
    .prepare<[string], AssetRow>(`SELECT * FROM video_assets WHERE project_id = ?`)
    .all(projectId)
  return rows.map(rowToAsset)
}

/** Registering twice with the same id is idempotent — mirrors appendOp. */
export function registerAsset(db: Database, asset: YAsset): YAsset {
  db.prepare(
    `INSERT OR IGNORE INTO video_assets
       (id, project_id, storage_path, duration_ms, width, height, sha256)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    asset.id,
    asset.projectId,
    asset.storagePath,
    asset.durationMs,
    asset.width ?? null,
    asset.height ?? null,
    asset.sha256 ?? null,
  )
  return asset
}
