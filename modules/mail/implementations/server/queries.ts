import type Database from 'better-sqlite3'
import type { YEmailMessage, YMailFolder } from '../../types.ts'
import { randomUUID } from 'crypto'

export function getAllFolders(db: Database.Database): YMailFolder[] {
  const stmt = db.prepare(`
    SELECT id, name, type, message_count as messageCount, unread_count as unreadCount, created_at as createdAt
    FROM mail_folders
    ORDER BY created_at ASC
  `)
  return stmt.all() as YMailFolder[]
}

export function getFolder(db: Database.Database, folderId: string): YMailFolder | null {
  const stmt = db.prepare(`
    SELECT id, name, type, message_count as messageCount, unread_count as unreadCount, created_at as createdAt
    FROM mail_folders
    WHERE id = ?
  `)
  return (stmt.get(folderId) as YMailFolder | undefined) ?? null
}

export function createFolder(db: Database.Database, name: string, type: 'custom'): YMailFolder {
  const id = randomUUID()
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO mail_folders (id, name, type, created_at)
    VALUES (?, ?, ?, ?)
  `)
  stmt.run(id, name, type, now)
  return {
    id,
    name,
    type,
    messageCount: 0,
    unreadCount: 0,
    createdAt: now,
  }
}

export function getMessagesByFolder(db: Database.Database, folderId: string, limit = 50, offset = 0): YEmailMessage[] {
  const stmt = db.prepare(`
    SELECT
      id, message_id as messageId, folder_id as folderId,
      from_addr as fromAddr, to_addrs as toAddrs, cc_addrs as ccAddrs, bcc_addrs as bccAddrs,
      subject, date, in_reply_to as inReplyTo, "references",
      mime_type as mimeType, body, raw_size as rawSize,
      spam_score as spamScore, spam_threshold as spamThreshold,
      spf_result as spfResult, dkim_result as dkimResult, dmarc_result as dmarcResult,
      flag_read as read, flag_starred as starred, flag_spam as spam, flag_trash as trash,
      created_at as createdAt
    FROM mail_messages
    WHERE folder_id = ? AND flag_trash = 0
    ORDER BY date DESC
    LIMIT ? OFFSET ?
  `)
  const rows = stmt.all(folderId, limit, offset) as any[]
  return rows.map(row => ({
    id: row.id,
    messageId: row.messageId,
    folderId: row.folderId,
    from: row.fromAddr,
    to: JSON.parse(row.toAddrs),
    cc: row.ccAddrs ? JSON.parse(row.ccAddrs) : undefined,
    bcc: row.bccAddrs ? JSON.parse(row.bccAddrs) : undefined,
    subject: row.subject,
    date: row.date,
    inReplyTo: row.inReplyTo,
    references: row.references ? row.references.split(',') : undefined,
    mimeType: row.mimeType,
    body: row.body,
    attachmentIds: [],
    flags: {
      read: row.read === 1,
      starred: row.starred === 1,
      spam: row.spam === 1,
      trash: row.trash === 1,
    },
    spamScore: row.spamScore,
    spamThreshold: row.spamThreshold,
    authResult: {
      spf: row.spfResult,
      dkim: row.dkimResult,
      dmarc: row.dmarcResult,
    },
    rawSize: row.rawSize,
    createdAt: row.createdAt,
  }))
}

export function getMessage(db: Database.Database, messageId: string): YEmailMessage | null {
  const stmt = db.prepare(`
    SELECT
      id, message_id as messageId, folder_id as folderId,
      from_addr as fromAddr, to_addrs as toAddrs, cc_addrs as ccAddrs, bcc_addrs as bccAddrs,
      subject, date, in_reply_to as inReplyTo, "references",
      mime_type as mimeType, body, raw_size as rawSize,
      spam_score as spamScore, spam_threshold as spamThreshold,
      spf_result as spfResult, dkim_result as dkimResult, dmarc_result as dmarcResult,
      flag_read as read, flag_starred as starred, flag_spam as spam, flag_trash as trash,
      created_at as createdAt
    FROM mail_messages
    WHERE id = ?
  `)
  const row = stmt.get(messageId) as any
  if (!row) return null

  return {
    id: row.id,
    messageId: row.messageId,
    folderId: row.folderId,
    from: row.fromAddr,
    to: JSON.parse(row.toAddrs),
    cc: row.ccAddrs ? JSON.parse(row.ccAddrs) : undefined,
    bcc: row.bccAddrs ? JSON.parse(row.bccAddrs) : undefined,
    subject: row.subject,
    date: row.date,
    inReplyTo: row.inReplyTo,
    references: row.references ? row.references.split(',') : undefined,
    mimeType: row.mimeType,
    body: row.body,
    attachmentIds: [],
    flags: {
      read: row.read === 1,
      starred: row.starred === 1,
      spam: row.spam === 1,
      trash: row.trash === 1,
    },
    spamScore: row.spamScore,
    spamThreshold: row.spamThreshold,
    authResult: {
      spf: row.spfResult,
      dkim: row.dkimResult,
      dmarc: row.dmarcResult,
    },
    rawSize: row.rawSize,
    createdAt: row.createdAt,
  }
}

export function createMessage(
  db: Database.Database,
  folderId: string,
  msg: {
    messageId: string
    from: string
    to: string[]
    cc?: string[]
    bcc?: string[]
    subject: string
    date: string
    mimeType: string
    body: string
    rawSize: number
    spamScore?: number
    authResult?: { spf: string; dkim: string; dmarc: string }
  },
): string {
  const id = randomUUID()
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO mail_messages (
      id, message_id, folder_id, from_addr, to_addrs, cc_addrs, bcc_addrs,
      subject, date, mime_type, body, raw_size, spam_score,
      spf_result, dkim_result, dmarc_result, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    id,
    msg.messageId,
    folderId,
    msg.from,
    JSON.stringify(msg.to),
    msg.cc ? JSON.stringify(msg.cc) : null,
    msg.bcc ? JSON.stringify(msg.bcc) : null,
    msg.subject,
    msg.date,
    msg.mimeType,
    msg.body,
    msg.rawSize,
    msg.spamScore ?? 0,
    msg.authResult?.spf ?? 'none',
    msg.authResult?.dkim ?? 'none',
    msg.authResult?.dmarc ?? 'none',
    now,
  )
  return id
}

export function updateMessageFlags(
  db: Database.Database,
  messageId: string,
  flags: Partial<{ read: boolean; starred: boolean; spam: boolean; trash: boolean }>,
) {
  const updates: string[] = []
  const values: any[] = []
  if (flags.read !== undefined) {
    updates.push('flag_read = ?')
    values.push(flags.read ? 1 : 0)
  }
  if (flags.starred !== undefined) {
    updates.push('flag_starred = ?')
    values.push(flags.starred ? 1 : 0)
  }
  if (flags.spam !== undefined) {
    updates.push('flag_spam = ?')
    values.push(flags.spam ? 1 : 0)
  }
  if (flags.trash !== undefined) {
    updates.push('flag_trash = ?')
    values.push(flags.trash ? 1 : 0)
  }
  if (updates.length === 0) return
  values.push(messageId)
  const stmt = db.prepare(`UPDATE mail_messages SET ${updates.join(', ')} WHERE id = ?`)
  stmt.run(...values)
}

export function deleteMessage(db: Database.Database, messageId: string) {
  const stmt = db.prepare('DELETE FROM mail_messages WHERE id = ?')
  stmt.run(messageId)
}
