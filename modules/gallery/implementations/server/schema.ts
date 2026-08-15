export const schema = `
CREATE TABLE IF NOT EXISTS media_items (
  id            TEXT PRIMARY KEY,
  path          TEXT NOT NULL UNIQUE,             -- POSIX path RELATIVE to the NAS root
  kind          TEXT NOT NULL,                    -- 'image' | 'video'
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  mtime_ms      INTEGER NOT NULL,
  content_hash  TEXT,                             -- sha256 hex; NULL until the lazy hash job runs
  taken_at      TEXT,                             -- naive local ISO; EXIF DateTimeOriginal, fallback mtime
  width         INTEGER,
  height        INTEGER,
  gps_lat       REAL,
  gps_lon       REAL,
  camera_make   TEXT,
  camera_model  TEXT,
  duration_s    REAL,                             -- video only
  meta_status   TEXT NOT NULL DEFAULT 'pending',  -- pending | ok | failed
  thumb_status  TEXT NOT NULL DEFAULT 'pending',  -- pending | ok | failed | unsupported
  missing       INTEGER NOT NULL DEFAULT 0,       -- file vanished on rescan (tombstone; tags survive)
  indexed_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_taken ON media_items (taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_hash  ON media_items (content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_gps   ON media_items (gps_lat)      WHERE gps_lat IS NOT NULL;

CREATE TABLE IF NOT EXISTS media_tags (
  id    TEXT PRIMARY KEY,
  kind  TEXT NOT NULL DEFAULT 'user',             -- 'user' | 'person' | 'location'
  name  TEXT NOT NULL,                            -- 'mountain', 'playa'… (no '#' stored)
  UNIQUE (kind, name)
);
CREATE TABLE IF NOT EXISTS media_item_tags (
  item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES media_tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON media_item_tags (tag_id);

CREATE TABLE IF NOT EXISTS media_albums (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  cover_item_id TEXT REFERENCES media_items(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_album_items (
  album_id TEXT NOT NULL REFERENCES media_albums(id) ON DELETE CASCADE,
  item_id  TEXT NOT NULL REFERENCES media_items(id)  ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (album_id, item_id)
);

-- Minimal durable job queue for the in-process gallery worker.
CREATE TABLE IF NOT EXISTS media_jobs (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,                       -- 'meta' | 'thumb' | 'hash'
  item_id    TEXT,
  status     TEXT NOT NULL DEFAULT 'queued',      -- queued | running | done | failed
  attempts   INTEGER NOT NULL DEFAULT 0,
  error      TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON media_jobs (status, type);
`
