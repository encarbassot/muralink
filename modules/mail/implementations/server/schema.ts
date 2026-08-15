import type Database from 'better-sqlite3'
import { initMailSetupSchema } from './setup.ts'

export function initMailSchema(db: Database.Database) {
  initMailSetupSchema(db)
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('inbox', 'sent', 'spam', 'trash', 'drafts', 'custom')),
      message_count INTEGER DEFAULT 0,
      unread_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mail_messages (
      id TEXT PRIMARY KEY,
      message_id TEXT UNIQUE,
      folder_id TEXT NOT NULL REFERENCES mail_folders(id),
      from_addr TEXT NOT NULL,
      to_addrs TEXT NOT NULL,
      cc_addrs TEXT,
      bcc_addrs TEXT,
      subject TEXT,
      date TEXT NOT NULL,
      in_reply_to TEXT,
      -- "references" is a SQLite keyword — quoted, or CREATE TABLE fails outright.
      "references" TEXT,
      mime_type TEXT DEFAULT 'text/plain',
      body TEXT,
      raw_size INTEGER,
      spam_score REAL DEFAULT 0,
      spam_threshold REAL DEFAULT 5,
      spf_result TEXT DEFAULT 'none',
      dkim_result TEXT DEFAULT 'none',
      dmarc_result TEXT DEFAULT 'none',
      flag_read INTEGER DEFAULT 0,
      flag_starred INTEGER DEFAULT 0,
      flag_spam INTEGER DEFAULT 0,
      flag_trash INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(folder_id) REFERENCES mail_folders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mail_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER,
      storage_path TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mail_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('inbound-process', 'outbound-send')),
      status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'done', 'failed')),
      payload TEXT NOT NULL,
      error TEXT,
      attempts INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_mail_messages_folder ON mail_messages(folder_id);
    CREATE INDEX IF NOT EXISTS idx_mail_messages_date ON mail_messages(date);
    CREATE INDEX IF NOT EXISTS idx_mail_attachments_message ON mail_attachments(message_id);
    CREATE INDEX IF NOT EXISTS idx_mail_jobs_status ON mail_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_mail_jobs_type ON mail_jobs(type);
  `)
}
