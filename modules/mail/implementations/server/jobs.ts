import type Database from 'better-sqlite3'
import type { MailFileAccess } from './fileAccess.ts'
import { randomUUID } from 'crypto'

export interface MailWorker {
  stop: () => void
  kick: () => void
}

export function startMailWorker(
  db: Database.Database,
  files: MailFileAccess,
  config: { enabled: boolean; domain?: string },
): MailWorker {
  let running = true
  let isProcessing = false

  const MAX_ATTEMPTS = 3
  const IDLE_TIMEOUT = 5000

  async function processJob(jobId: string) {
    const jobStmt = db.prepare('SELECT * FROM mail_jobs WHERE id = ?')
    const job = jobStmt.get(jobId) as any
    if (!job) return

    try {
      const updateStmt = db.prepare('UPDATE mail_jobs SET status = ?, started_at = ? WHERE id = ?')
      updateStmt.run('running', new Date().toISOString(), jobId)

      const payload = JSON.parse(job.payload)

      if (job.type === 'inbound-process') {
        // Incoming mail processing — parse, verify, store
      } else if (job.type === 'outbound-send') {
        // Outgoing mail — sign, queue, deliver to MX
      }

      const completeStmt = db.prepare('UPDATE mail_jobs SET status = ?, completed_at = ? WHERE id = ?')
      completeStmt.run('done', new Date().toISOString(), jobId)
    } catch (err) {
      const attempts = (job.attempts || 0) + 1
      const error = err instanceof Error ? err.message : String(err)

      if (attempts < MAX_ATTEMPTS) {
        const retryStmt = db.prepare(
          'UPDATE mail_jobs SET status = ?, attempts = ?, error = ? WHERE id = ?',
        )
        retryStmt.run('queued', attempts, error, jobId)
      } else {
        const failStmt = db.prepare('UPDATE mail_jobs SET status = ?, attempts = ?, error = ? WHERE id = ?')
        failStmt.run('failed', attempts, error, jobId)
      }
    }
  }

  async function loop() {
    while (running) {
      if (isProcessing) {
        await new Promise(resolve => setTimeout(resolve, IDLE_TIMEOUT))
        continue
      }

      try {
        isProcessing = true

        const nextStmt = db.prepare(`
          SELECT id FROM mail_jobs
          WHERE status = 'queued'
          ORDER BY created_at ASC
          LIMIT 1
        `)
        const next = nextStmt.get() as any

        if (!next) {
          isProcessing = false
          await new Promise(resolve => setTimeout(resolve, IDLE_TIMEOUT))
          continue
        }

        await processJob(next.id)
      } catch (err) {
        console.error('Mail worker error:', err)
      } finally {
        isProcessing = false
      }
    }
  }

  // On startup, recover any jobs stuck in 'running' state
  const recoverStmt = db.prepare(`UPDATE mail_jobs SET status = 'queued' WHERE status = 'running'`)
  recoverStmt.run()

  const loopPromise = loop()

  return {
    stop: () => {
      running = false
    },
    kick: () => {
      if (isProcessing) return
      isProcessing = true
      processJob(
        (db.prepare('SELECT id FROM mail_jobs WHERE status = ? ORDER BY created_at ASC LIMIT 1').get('queued') as any)
          ?.id,
      ).finally(() => {
        isProcessing = false
      })
    },
  }
}

export function enqueueJob(
  db: Database.Database,
  type: 'inbound-process' | 'outbound-send',
  payload: any,
): string {
  const id = randomUUID()
  const stmt = db.prepare(`
    INSERT INTO mail_jobs (id, type, status, payload, created_at)
    VALUES (?, ?, 'queued', ?, ?)
  `)
  stmt.run(id, type, JSON.stringify(payload), new Date().toISOString())
  return id
}
