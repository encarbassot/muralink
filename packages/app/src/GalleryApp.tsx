// Gallery — the media lens over the NAS. A scrollable 5-column wall of 1:1
// thumbnails (plain CSS grid, NOT the bento GridCanvas: a photo wall holds
// thousands of items, not a handful of arrangeable cells), with tag filtering,
// bulk tagging, resumable phone uploads and a lightbox. Local-first: the last
// listing is cached so reopening offline still shows the wall.

import { useCallback, useEffect, useRef, useState } from 'react'
import { galleryApi, type YMediaItem, type YMediaTag, type YGalleryStatus } from './galleryApi.ts'
import { storageApi, type UploadProgress } from './storageApi.ts'

const COLUMNS = 5
const PAGE = 100
const CACHE_KEY = 'elio.gallery.cache'

// ── Offline cache (last unfiltered first page) ─────────────────────────────

function readCache(): YMediaItem[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]') as YMediaItem[]
  } catch {
    return []
  }
}

function writeCache(items: YMediaItem[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(items.slice(0, PAGE)))
  } catch { /* quota — cache is best-effort */ }
}

// ── Upload queue ───────────────────────────────────────────────────────────

interface QueuedUpload {
  file: File
  status: 'queued' | 'uploading' | 'done' | 'duplicate' | 'error'
  progress: number // 0..1
  error?: string
}

export function GalleryApp() {
  const [items, setItems] = useState<YMediaItem[]>(readCache)
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [tags, setTags] = useState<YMediaTag[]>([])
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [status, setStatus] = useState<YGalleryStatus | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lightbox, setLightbox] = useState<number | null>(null) // index into items
  const [queue, setQueue] = useState<QueuedUpload[]>([])
  const [loading, setLoading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  const loadFirst = useCallback((tag: string | null) => {
    setLoading(true)
    galleryApi
      .items({ limit: PAGE, tag: tag ?? undefined })
      .then(page => {
        setItems(page.items)
        setNextCursor(page.nextCursor)
        setOffline(false)
        if (!tag) writeCache(page.items)
      })
      .catch(() => setOffline(true)) // keep the cached wall
      .finally(() => setLoading(false))
  }, [])

  const loadMore = useCallback(() => {
    if (!nextCursor || loading) return
    setLoading(true)
    galleryApi
      .items({ limit: PAGE, cursor: nextCursor, tag: activeTag ?? undefined })
      .then(page => {
        setItems(prev => [...prev, ...page.items])
        setNextCursor(page.nextCursor)
      })
      .catch(() => { /* transient — sentinel retries on next intersection */ })
      .finally(() => setLoading(false))
  }, [nextCursor, loading, activeTag])

  useEffect(() => { loadFirst(activeTag) }, [activeTag, loadFirst])
  useEffect(() => { galleryApi.tags().then(setTags).catch(() => { /* offline */ }) }, [items.length])

  // Poll indexing status while there's pending work (shows "indexando…").
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let stopped = false
    const tick = () => {
      galleryApi.status().then(s => {
        if (stopped) return
        setStatus(s)
        if (s.scanning || s.pendingMeta > 0 || s.pendingThumbs > 0) timer = setTimeout(tick, 3000)
      }).catch(() => { /* offline */ })
    }
    tick()
    return () => { stopped = true; clearTimeout(timer) }
  }, [items.length])

  // Infinite scroll: load the next page when the sentinel becomes visible.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) loadMore()
    })
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore])

  // ── uploads (sequential — LAN + old-laptop disk are the bottleneck) ───────

  const runQueue = async (files: File[]) => {
    const root = await storageApi.root().catch(() => null)
    if (!root) { window.alert('Storage no disponible'); return }
    setQueue(files.map(file => ({ file, status: 'queued', progress: 0 })))
    for (let i = 0; i < files.length; i++) {
      setQueue(q => q.map((u, j) => (j === i ? { ...u, status: 'uploading' } : u)))
      try {
        const result = await storageApi.uploadResumable(root, files[i]!, {
          onProgress: (p: UploadProgress) =>
            setQueue(q => q.map((u, j) => (j === i ? { ...u, progress: p.sent / Math.max(p.total, 1) } : u))),
        })
        setQueue(q => q.map((u, j) =>
          j === i ? { ...u, status: result.duplicate ? 'duplicate' : 'done', progress: 1 } : u))
      } catch (e) {
        setQueue(q => q.map((u, j) => (j === i ? { ...u, status: 'error', error: String(e) } : u)))
      }
    }
    loadFirst(activeTag)
  }

  // ── bulk tagging ──────────────────────────────────────────────────────────

  const bulkTag = async () => {
    const name = window.prompt('Tag para la selección (p. ej. mountain)')
    if (!name) return
    for (const id of selected) await galleryApi.addTag(id, name).catch(() => { /* keep going */ })
    setSelecting(false)
    setSelected(new Set())
    loadFirst(activeTag)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const pendingWork = status && (status.scanning || status.pendingMeta > 0 || status.pendingThumbs > 0)
  const uploading = queue.some(u => u.status === 'queued' || u.status === 'uploading')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      {/* Toolbar: tag chips + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', flexShrink: 0 }}>
        <Chip label="Todo" active={!activeTag} onClick={() => setActiveTag(null)} />
        {tags.map(t => (
          <Chip
            key={t.id}
            label={`#${t.name}${t.count ? ` · ${t.count}` : ''}`}
            active={activeTag === t.id}
            onClick={() => setActiveTag(activeTag === t.id ? null : t.id)}
          />
        ))}
        <span style={{ flex: 1 }} />
        {pendingWork && (
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            ⏳ indexando… {status.total - Math.max(status.pendingMeta, status.pendingThumbs)} / {status.total}
          </span>
        )}
        {offline && <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>📡 sin conexión — mostrando caché</span>}
        {selecting ? (
          <>
            <ToolButton onClick={bulkTag} disabled={selected.size === 0}>🏷️ Etiquetar ({selected.size})</ToolButton>
            <ToolButton onClick={() => { setSelecting(false); setSelected(new Set()) }}>✕</ToolButton>
          </>
        ) : (
          <>
            <ToolButton onClick={() => setSelecting(true)}>☑️ Seleccionar</ToolButton>
            <ToolButton onClick={() => { void galleryApi.scan() }}>🔄 Escanear</ToolButton>
            <ToolButton onClick={() => fileInput.current?.click()}>⬆️ Subir</ToolButton>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/*,video/*"
          style={{ display: 'none' }}
          onChange={e => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length) void runQueue(files)
          }}
        />
      </div>

      {/* Upload queue */}
      {queue.length > 0 && (
        <UploadStrip queue={queue} onClear={() => { if (!uploading) setQueue([]) }} />
      )}

      {/* The wall */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
        {items.length === 0 && !loading && (
          <div style={{ color: 'var(--fg-dim)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
            {offline ? 'Sin conexión y sin caché todavía.' : 'Sin fotos aún — sube desde el móvil o copia archivos al NAS y escanea.'}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`, gap: 6 }}>
          {items.map((item, i) => (
            <MediaThumb
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              selecting={selecting}
              onClick={() => (selecting ? toggleSelect(item.id) : setLightbox(i))}
            />
          ))}
        </div>
        <div ref={sentinel} style={{ height: 1 }} />
        {loading && <div style={{ textAlign: 'center', color: 'var(--fg-dim)', fontSize: 12, padding: 12 }}>Cargando…</div>}
      </div>

      {lightbox != null && items[lightbox] && (
        <Lightbox
          item={items[lightbox]}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox(i => (i != null && i > 0 ? i - 1 : i))}
          onNext={() => setLightbox(i => (i != null && i < items.length - 1 ? i + 1 : i))}
          onTagsChanged={updated => setItems(prev => prev.map(it => (it.id === updated.id ? updated : it)))}
        />
      )}
    </div>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--accent)' : 'var(--bg-elevated)',
        color: active ? '#fff' : 'var(--fg)',
        border: '1px solid var(--border)',
        borderRadius: 999,
        fontSize: 11,
        padding: '3px 10px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function ToolButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none',
        border: '1px solid var(--border)',
        borderRadius: 6,
        color: 'var(--fg-dim)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: 12,
        padding: '3px 8px',
      }}
    >
      {children}
    </button>
  )
}

function MediaThumb({ item, selecting, selected, onClick }: {
  item: YMediaItem
  selecting: boolean
  selected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      title={item.path}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        background: 'var(--bg-elevated)',
        outline: selected ? '3px solid var(--accent)' : 'none',
        outlineOffset: -3,
      }}
    >
      <img
        src={galleryApi.thumbUrl(item.id)}
        alt={item.path}
        loading="lazy"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {item.kind === 'video' && (
        <span style={{ position: 'absolute', top: 4, right: 6, fontSize: 12, textShadow: '0 0 4px #000' }}>▶</span>
      )}
      {selecting && (
        <span style={{ position: 'absolute', top: 4, left: 6, fontSize: 13 }}>{selected ? '☑️' : '⬜'}</span>
      )}
    </div>
  )
}

function UploadStrip({ queue, onClear }: { queue: QueuedUpload[]; onClear: () => void }) {
  const done = queue.filter(u => u.status === 'done' || u.status === 'duplicate').length
  const errors = queue.filter(u => u.status === 'error').length
  const current = queue.find(u => u.status === 'uploading')
  const overall = queue.reduce((acc, u) => acc + u.progress, 0) / Math.max(queue.length, 1)
  return (
    <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--fg-dim)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current
            ? `⬆️ ${current.file.name} (${Math.round(current.progress * 100)}%)`
            : `Subida completada — ${done}/${queue.length}${errors ? `, ${errors} errores` : ''}`}
          {' · '}{done}/{queue.length}
        </span>
        {!current && (
          <button onClick={onClear} style={{ background: 'none', border: 'none', color: 'var(--fg-dim)', cursor: 'pointer', fontSize: 12 }}>✕</button>
        )}
      </div>
      <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 2, marginTop: 4 }}>
        <div style={{ height: '100%', width: `${Math.round(overall * 100)}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

function Lightbox({ item, onClose, onPrev, onNext, onTagsChanged }: {
  item: YMediaItem
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onTagsChanged: (item: YMediaItem) => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    // Capture phase so Escape closes the lightbox before AppPanel's handler
    // navigates back to the dashboard.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, onPrev, onNext])

  const addTag = async () => {
    const name = window.prompt('Añadir tag (p. ej. playa)')
    if (!name) return
    const tag = await galleryApi.addTag(item.id, name)
    onTagsChanged({ ...item, tags: [...item.tags.filter(t => t.id !== tag.id), tag] })
  }

  const removeTag = async (tagId: string) => {
    await galleryApi.removeTag(item.id, tagId)
    onTagsChanged({ ...item, tags: item.tags.filter(t => t.id !== tagId) })
  }

  const taken = item.takenAt ? item.takenAt.replace('T', ' ') : null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.92)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', color: '#ddd', fontSize: 12 }} onClick={e => e.stopPropagation()}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.path}</span>
        {taken && <span>📅 {taken}</span>}
        {item.gps && <span>📍 {item.gps.lat.toFixed(4)}, {item.gps.lon.toFixed(4)}</span>}
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ddd', fontSize: 18, cursor: 'pointer' }}>✕</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <NavArrow dir="‹" onClick={e => { e.stopPropagation(); onPrev() }} />
        {item.kind === 'video' ? (
          <video
            key={item.id}
            src={galleryApi.fileUrl(item.id)}
            controls
            autoPlay
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 'calc(100% - 120px)', maxHeight: '100%' }}
          />
        ) : (
          <img
            key={item.id}
            src={galleryApi.fileUrl(item.id)}
            alt={item.path}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 'calc(100% - 120px)', maxHeight: '100%', objectFit: 'contain' }}
          />
        )}
        <NavArrow dir="›" onClick={e => { e.stopPropagation(); onNext() }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
        {item.tags.map(t => (
          <span
            key={t.id}
            style={{ background: '#222', color: '#ddd', borderRadius: 999, fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}
            title="Quitar tag"
            onClick={() => void removeTag(t.id)}
          >
            #{t.name} ✕
          </span>
        ))}
        <button
          onClick={() => void addTag()}
          style={{ background: 'none', border: '1px dashed #555', borderRadius: 999, color: '#aaa', fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}
        >
          + tag
        </button>
      </div>
    </div>
  )
}

function NavArrow({ dir, onClick }: { dir: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      style={{ background: 'none', border: 'none', color: '#888', fontSize: 40, cursor: 'pointer', width: 48, flexShrink: 0 }}
    >
      {dir}
    </button>
  )
}
