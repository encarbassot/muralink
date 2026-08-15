// Vault REST routes, mounted at /api/passwords. REST-at-mount-root so the
// client's http space can point straight at '/api/passwords', exactly like
// notes — the difference is entirely in what the payload contains.
//
// Validation here is structural only (is this base64-shaped, is it under the
// size cap). There is nothing semantic to validate: the server cannot tell a
// real entry from noise, and that is the point.

import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { YEncryptedBlob, YVaultRecord } from '../../types.ts'
import {
  countVaultRecords, createVaultRecord, deleteVaultRecord, getVaultMeta,
  getVaultRecord, getVaultRecords, putVaultMeta, updateVaultRecord,
} from './queries.ts'

// A single entry is a url + username + password; 64 KB of ciphertext is orders
// of magnitude more than that and still small enough that a runaway client
// cannot fill the disk one POST at a time.
const MAX_BLOB_CHARS = 64 * 1024
const B64 = /^[A-Za-z0-9+/]+={0,2}$/

function validBlob(value: unknown): value is YEncryptedBlob {
  if (!value || typeof value !== 'object') return false
  const blob = value as Partial<YEncryptedBlob>
  if (typeof blob.ciphertext !== 'string' || typeof blob.iv !== 'string') return false
  if (!blob.ciphertext || !blob.iv) return false
  if (blob.ciphertext.length > MAX_BLOB_CHARS || blob.iv.length > 64) return false
  return B64.test(blob.ciphertext) && B64.test(blob.iv)
}

export function createPasswordsRouter(db: Database): Router {
  const router = Router()

  // ── meta: the PIN salt + verifier ──────────────────────────────────────────
  // GET is what a second device calls before its first unlock: with the salt it
  // can derive the same key from the same PIN, and with the verifier it can
  // tell a wrong PIN from an empty vault.

  router.get('/meta', (_req, res) => {
    const meta = getVaultMeta(db)
    if (!meta) { res.status(404).json({ error: 'no vault' }); return }
    res.json(meta)
  })

  router.put('/meta', (req, res) => {
    const body = req.body as { salt?: string; verifier?: unknown; force?: boolean }
    if (typeof body.salt !== 'string' || !body.salt || !validBlob(body.verifier)) {
      res.status(400).json({ error: 'salt and verifier required' })
      return
    }
    // Replacing the meta changes which key opens this vault. Every stored
    // ciphertext was written under the old key, so allowing it silently would
    // turn the whole vault into unreadable bytes. The client re-keys by
    // rewriting the entries first (or clearing them) and then passing force.
    const existing = getVaultMeta(db)
    if (existing && existing.salt !== body.salt && !body.force && countVaultRecords(db) > 0) {
      res.status(409).json({
        error: 'vault already initialised with a different PIN',
        entries: countVaultRecords(db),
      })
      return
    }
    res.json(putVaultMeta(db, { salt: body.salt, verifier: body.verifier }))
  })

  // ── entries ────────────────────────────────────────────────────────────────

  router.get('/', (_req, res) => {
    res.json(getVaultRecords(db))
  })

  router.get('/:id', (req, res) => {
    const record = getVaultRecord(db, req.params['id']!)
    if (!record) { res.status(404).json({ error: 'not found' }); return }
    res.json(record)
  })

  router.post('/', (req, res) => {
    const body = req.body as Partial<YVaultRecord>
    if (!validBlob(body.blob)) { res.status(400).json({ error: 'blob required' }); return }
    // The id comes from the server, not the client: a client-chosen id is one
    // more thing an unauthenticated caller could use to overwrite an entry.
    const record = createVaultRecord(db, {
      id: randomUUID(),
      blob: body.blob,
      updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : new Date().toISOString(),
    })
    res.status(201).json(record)
  })

  router.patch('/:id', (req, res) => {
    const body = req.body as Partial<YVaultRecord>
    if (body.blob !== undefined && !validBlob(body.blob)) {
      res.status(400).json({ error: 'invalid blob' }); return
    }
    const updated = updateVaultRecord(db, req.params['id']!, {
      blob: body.blob,
      updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : undefined,
    })
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/:id', (req, res) => {
    if (!deleteVaultRecord(db, req.params['id']!)) {
      res.status(404).json({ error: 'not found' }); return
    }
    res.status(204).end()
  })

  return router
}
