export const schema = `
CREATE TABLE IF NOT EXISTS video_projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_by  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Append-only. Never UPDATEd or DELETEd — a correction is itself a new op.
-- Ordering for replay is (lamport_counter, lamport_actor), NOT id/rowid: two
-- devices can each append an op with an earlier stamp than one already
-- stored here after they come back online.
CREATE TABLE IF NOT EXISTS video_ops (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES video_projects(id),
  lamport_counter INTEGER NOT NULL,
  lamport_actor   TEXT NOT NULL,
  op_type         TEXT NOT NULL,
  payload         TEXT NOT NULL, -- JSON, opaque to the server
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_video_ops_project_order
  ON video_ops (project_id, lamport_counter, lamport_actor);

CREATE TABLE IF NOT EXISTS video_assets (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES video_projects(id),
  storage_path TEXT NOT NULL,
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  width        INTEGER,
  height       INTEGER,
  sha256       TEXT
);

CREATE INDEX IF NOT EXISTS idx_video_assets_project ON video_assets (project_id);
`
