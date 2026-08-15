import express from 'express'
import type Database from 'better-sqlite3'
import type { MailFileAccess } from './fileAccess.ts'
import { getAllFolders, getMessage, getMessagesByFolder } from './queries.ts'
import { createMailSetupRouter } from './setupRoutes.ts'
import { getSetup } from './setup.ts'

export function createMailRouter(
  db: Database.Database,
  files: MailFileAccess | null,
  config: { enabled: boolean; domain?: string },
) {
  const router = express.Router()

  // Mounted unconditionally — the wizard is how a not-yet-enabled instance
  // becomes an enabled one. Everything below reads the *live* setup rather
  // than the boot-time env, so enabling takes effect without a core restart.
  router.use('/setup', createMailSetupRouter(db))

  const live = () => {
    const setup = getSetup(db)
    return { enabled: setup.enabled || config.enabled, domain: setup.domain || config.domain, configured: setup.configured }
  }

  router.get('/folders', (_req, res) => {
    try {
      const folders = getAllFolders(db)
      res.json(folders)
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch folders' })
    }
  })

  router.get('/messages', (req, res) => {
    try {
      const folderId = req.query.folder as string
      const limit = parseInt(req.query.limit as string) || 50
      const offset = parseInt(req.query.offset as string) || 0

      if (!folderId) {
        return res.status(400).json({ error: 'folder parameter required' })
      }

      const messages = getMessagesByFolder(db, folderId, limit, offset)
      res.json({ messages, total: messages.length })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch messages' })
    }
  })

  router.get('/messages/:id', (req, res) => {
    try {
      const message = getMessage(db, req.params.id)
      if (!message) {
        return res.status(404).json({ error: 'Message not found' })
      }
      res.json(message)
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch message' })
    }
  })

  router.post('/send', (req, res) => {
    try {
      if (!live().enabled) {
        return res.status(503).json({ error: 'Mail service not enabled' })
      }

      const { to, subject, body } = req.body
      if (!to || !subject || !body) {
        return res.status(400).json({ error: 'to, subject, body required' })
      }

      res.json({ queued: true, message: 'Message queued for sending' })
    } catch (error) {
      res.status(500).json({ error: 'Failed to queue message' })
    }
  })

  router.get('/attachments/:id', (req, res) => {
    try {
      if (!files) {
        return res.status(503).json({ error: 'File storage not available' })
      }

      const filepath = files.resolve(req.params.id)
      files.serve(filepath, res)
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve attachment' })
    }
  })

  router.get('/search', (req, res) => {
    try {
      const query = req.query.q as string
      if (!query) {
        return res.status(400).json({ error: 'q parameter required' })
      }

      res.json({ results: [] })
    } catch (error) {
      res.status(500).json({ error: 'Search failed' })
    }
  })

  return router
}
