import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'
import type {
  YMediaItem,
  YMediaTag,
  YMediaTagKind,
  YMediaPage,
  YMediaFilter,
  YGalleryStatus,
} from '../../types.ts'

export interface MediaRow {
  id: string
  path: string
  kind: string
  mime: string
  size: number
  mtime_ms: number
  content_hash: string | null
  taken_at: string | null
  width: number | null
  height: number | null
  gps_lat: number | null
  gps_lon: number | null
  camera_make: string | null
  camera_model: string | null
  duration_s: number | null
  meta_status: string
  thumb_status: string
  missing: number
  indexed_at: string
}

interface TagRow {
  id: string
  kind: string
  name: string
  count?: number
}

function rowToTag(row: TagRow): YMediaTag {
  const tag: YMediaTag = { id: row.id, kind: row.kind as YMediaTagKind, name: row.name }
  if (row.count !== undefined) tag.count = row.count
  return tag
}

function rowToItem(row: MediaRow, tags: YMediaTag[]): YMediaItem {
  return {
    id: row.id,
    path: row.path,
    kind: row.kind as YMediaItem['kind'],
    mime: row.mime,
    size: row.size,
    mtimeMs: row.mtime_ms,
    takenAt: row.taken_at ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    gps: row.gps_lat != null && row.gps_lon != null ? { lat: row.gps_lat, lon: row.gps_lon } : undefined,
    cameraMake: row.camera_make ?? undefined,
    cameraModel: row.camera_model ?? undefined,
    durationS: row.duration_s ?? undefined,
    thumbStatus: row.thumb_status as YMediaItem['thumbStatus'],
    missing: row.missing === 1 || undefined,
    tags,
  }
}

function tagsFor(db: Database, itemIds: string[]): Map<string, YMediaTag[]> {
  const map = new Map<string, YMediaTag[]>()
  if (itemIds.length === 0) return map
  const placeholders = itemIds.map(() => '?').join(',')
  const rows = db
    .prepare<string[], TagRow & { item_id: string }>(
      `SELECT it.item_id, t.id, t.kind, t.name
       FROM media_item_tags it JOIN media_tags t ON t.id = it.tag_id
       WHERE it.item_id IN (${placeholders})`,
    )
    .all(...itemIds)
  for (const row of rows) {
    const list = map.get(row.item_id) ?? []
    list.push(rowToTag(row))
    map.set(row.item_id, list)
  }
  return map
}

// Cursor = `${taken_at}|${id}` over the (taken_at DESC, id DESC) order. taken_at
// is never null in practice (mtime fallback), but treat null as '' to be safe.
export function listItems(db: Database, filter: YMediaFilter): YMediaPage {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500)
  const where: string[] = ['missing = 0']
  const params: (string | number)[] = []

  if (filter.kind) { where.push('kind = ?'); params.push(filter.kind) }
  if (filter.from) { where.push('taken_at >= ?'); params.push(filter.from) }
  if (filter.to) { where.push('taken_at <= ?'); params.push(filter.to) }
  if (filter.tag) {
    where.push('EXISTS (SELECT 1 FROM media_item_tags it WHERE it.item_id = media_items.id AND it.tag_id = ?)')
    params.push(filter.tag)
  }
  if (filter.cursor) {
    const sep = filter.cursor.lastIndexOf('|')
    const takenAt = sep >= 0 ? filter.cursor.slice(0, sep) : ''
    const id = sep >= 0 ? filter.cursor.slice(sep + 1) : filter.cursor
    where.push(`(COALESCE(taken_at, '') < ? OR (COALESCE(taken_at, '') = ? AND id < ?))`)
    params.push(takenAt, takenAt, id)
  }

  const rows = db
    .prepare<(string | number)[], MediaRow>(
      `SELECT * FROM media_items WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(taken_at, '') DESC, id DESC LIMIT ?`,
    )
    .all(...params, limit)

  const tagMap = tagsFor(db, rows.map(r => r.id))
  const items = rows.map(r => rowToItem(r, tagMap.get(r.id) ?? []))
  const last = rows[rows.length - 1]
  return {
    items,
    nextCursor: rows.length === limit && last ? `${last.taken_at ?? ''}|${last.id}` : undefined,
  }
}

export function getItem(db: Database, id: string): YMediaItem | undefined {
  const row = db.prepare<[string], MediaRow>(`SELECT * FROM media_items WHERE id = ?`).get(id)
  if (!row) return undefined
  return rowToItem(row, tagsFor(db, [row.id]).get(row.id) ?? [])
}

export function getItemRow(db: Database, id: string): MediaRow | undefined {
  return db.prepare<[string], MediaRow>(`SELECT * FROM media_items WHERE id = ?`).get(id)
}

export function findByHash(db: Database, sha256: string): MediaRow | undefined {
  return db
    .prepare<[string], MediaRow>(`SELECT * FROM media_items WHERE content_hash = ? AND missing = 0`)
    .get(sha256)
}

// ── Tags ────────────────────────────────────────────────────────────────────

export function listTags(db: Database, kind?: YMediaTagKind): YMediaTag[] {
  const rows = kind
    ? db.prepare<[string], TagRow>(
        `SELECT t.*, COUNT(it.item_id) AS count FROM media_tags t
         LEFT JOIN media_item_tags it ON it.tag_id = t.id
         WHERE t.kind = ? GROUP BY t.id ORDER BY count DESC, t.name`,
      ).all(kind)
    : db.prepare<[], TagRow>(
        `SELECT t.*, COUNT(it.item_id) AS count FROM media_tags t
         LEFT JOIN media_item_tags it ON it.tag_id = t.id
         GROUP BY t.id ORDER BY count DESC, t.name`,
      ).all()
  return rows.map(rowToTag)
}

/** Attach a tag (created on first use) to an item. Idempotent. */
export function tagItem(db: Database, itemId: string, name: string, kind: YMediaTagKind): YMediaTag {
  const clean = name.trim().replace(/^#/, '')
  const attach = db.transaction((): YMediaTag => {
    let row = db
      .prepare<[string, string], TagRow>(`SELECT * FROM media_tags WHERE kind = ? AND name = ?`)
      .get(kind, clean)
    if (!row) {
      row = { id: randomUUID(), kind, name: clean }
      db.prepare(`INSERT INTO media_tags (id, kind, name) VALUES (?, ?, ?)`).run(row.id, kind, clean)
    }
    db.prepare(`INSERT OR IGNORE INTO media_item_tags (item_id, tag_id) VALUES (?, ?)`).run(itemId, row.id)
    return rowToTag(row)
  })
  return attach()
}

/** Detach a tag from an item; deletes the tag itself when orphaned. */
export function untagItem(db: Database, itemId: string, tagId: string): boolean {
  const detach = db.transaction((): boolean => {
    const result = db
      .prepare(`DELETE FROM media_item_tags WHERE item_id = ? AND tag_id = ?`)
      .run(itemId, tagId)
    db.prepare(
      `DELETE FROM media_tags WHERE id = ?
       AND NOT EXISTS (SELECT 1 FROM media_item_tags WHERE tag_id = ?)`,
    ).run(tagId, tagId)
    return result.changes > 0
  })
  return detach()
}

// ── Index upserts (scanner / worker) ────────────────────────────────────────

export interface UpsertFile {
  path: string
  kind: 'image' | 'video'
  mime: string
  size: number
  mtimeMs: number
}

/** Insert a new item or reset a changed one for re-processing. Returns the id,
 *  or null when the row is already up to date. */
export function upsertItem(db: Database, file: UpsertFile): string | null {
  const existing = db
    .prepare<[string], MediaRow>(`SELECT * FROM media_items WHERE path = ?`)
    .get(file.path)
  const now = new Date().toISOString()
  if (!existing) {
    const id = randomUUID()
    db.prepare(
      `INSERT INTO media_items (id, path, kind, mime, size, mtime_ms, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, file.path, file.kind, file.mime, file.size, file.mtimeMs, now)
    return id
  }
  if (existing.size === file.size && existing.mtime_ms === file.mtimeMs && existing.missing === 0) {
    return null // unchanged
  }
  // Changed (or back from missing): reset derived state, keep tags/albums.
  db.prepare(
    `UPDATE media_items SET kind = ?, mime = ?, size = ?, mtime_ms = ?, content_hash = NULL,
     meta_status = 'pending', thumb_status = 'pending', missing = 0, indexed_at = ? WHERE id = ?`,
  ).run(file.kind, file.mime, file.size, file.mtimeMs, now, existing.id)
  return existing.id
}

/** Tombstone every indexed item whose path was not seen by the scan. */
export function markMissingExcept(db: Database, seenPaths: Set<string>): number {
  const rows = db
    .prepare<[], { id: string; path: string }>(`SELECT id, path FROM media_items WHERE missing = 0`)
    .all()
  const gone = rows.filter(r => !seenPaths.has(r.path))
  const mark = db.transaction((ids: string[]) => {
    const stmt = db.prepare(`UPDATE media_items SET missing = 1 WHERE id = ?`)
    for (const id of ids) stmt.run(id)
  })
  mark(gone.map(r => r.id))
  return gone.length
}

export function status(db: Database, scanning: boolean): YGalleryStatus {
  const total = db.prepare<[], { n: number }>(
    `SELECT COUNT(*) AS n FROM media_items WHERE missing = 0`,
  ).get()!.n
  const pendingMeta = db.prepare<[], { n: number }>(
    `SELECT COUNT(*) AS n FROM media_items WHERE missing = 0 AND meta_status = 'pending'`,
  ).get()!.n
  const pendingThumbs = db.prepare<[], { n: number }>(
    `SELECT COUNT(*) AS n FROM media_items WHERE missing = 0 AND thumb_status = 'pending'`,
  ).get()!.n
  return { total, pendingMeta, pendingThumbs, scanning }
}
